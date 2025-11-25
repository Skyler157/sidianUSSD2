const baseFeature = require('./baseFeature');
const apiService = require('../services/apiService');

class PaybillService extends baseFeature {
    constructor() {
        super();
        this.merchantValidation = 'BILLERVALIDATION';
        this.merchantTransaction = '006001011';
    }

    async paybill(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[PAYBILL] Entry - Response: "${response}", Session: ${session}`);

        if (!response) {
            await this.updateSessionMenu(session, 'paybill', 'mobilemoney');
            return this.sendResponse(res, 'con', 'Enter PayBill Number\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.handleBackToMobileMoney(customer, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate paybill number
        if (!this.validatePaybillNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid PayBill number. Please enter a valid PayBill number:\n\n0. Back\n00. Exit');
        }

        // Store paybill number
        const sessionData = await this.ussdService.getSession(session);
        sessionData.paybill_number = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.paybillaccount(customer, msisdn, session, shortcode, null, res);
    }

    async paybillaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'paybillaccount', 'paybill');
            return this.sendResponse(res, 'con', 'Enter Account Number\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.paybill(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate account number
        if (!this.validateAccountNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid account number. Please enter a valid account number:\n\n0. Back\n00. Exit');
        }

        try {
            // Validate paybill and account with external API
            const validationResult = await this.validatePaybillAndAccount(customer, msisdn, session, shortcode, sessionData.paybill_number, response);

            if (validationResult.STATUS === '000' || validationResult.STATUS === 'OK') {
                const paybillName = this.cleanPaybillName(validationResult.DATA);

                // CRITICAL FIX: Save ALL session data properly
                sessionData.paybill_account = response;  // Save account number
                sessionData.paybill_name = paybillName;  // Save paybill name

                // Update session menu AND save session data
                await this.updateSessionMenu(session, 'paybillconfirm', 'paybillaccount');

                const message = `Confirm PayBill Name\n\n${paybillName}\n\n1. Confirm\n0. Back\n00. Exit`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMessage = validationResult.DATA || 'PayBill validation failed. Please check the PayBill number and account number and try again.';
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }
        } catch (error) {
            this.logger.error(`[PAYBILL] PayBill validation error: ${error.message}`);
            return this.sendResponse(res, 'con', 'Service temporarily unavailable. Please try again later.\n\n0. Back\n00. Exit');
        }
    }

    async paybillconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'paybillconfirm', 'paybillaccount');
            const paybillName = sessionData.paybill_name;
            return this.sendResponse(res, 'con', `Confirm PayBill Name\n\n${paybillName}\n\n1. Confirm\n0. Back\n00. Exit`);
        }

        if (response === '0') {
            return await this.paybillaccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response === '1') {
            // User confirmed paybill name - UPDATE SESSION
            await this.updateSessionMenu(session, 'paybillamount', 'paybillconfirm');
            return await this.paybillamount(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n0. Back\n00. Exit');
        }
    }

    async paybillamount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'paybillamount', 'paybillconfirm');
            return this.sendResponse(res, 'con', 'Enter Amount\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.paybillconfirm(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.paybill_amount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.paybillbankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async paybillbankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'paybillbankaccount', 'paybillamount');

            const accounts = customer.accounts || [];
            if (accounts.length === 0) {
                return this.sendResponse(res, 'end', 'No accounts found for this transaction.');
            }

            let message = 'Select source account:\n\n';
            accounts.forEach((account, index) => {
                message += `${index + 1}. ${account}\n`;
            });

            message += '\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.paybillamount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.paybill_bank_account = accounts[selectedIndex];
            await this.ussdService.saveSession(session, sessionData);

            return await this.paybillremark(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async paybillremark(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'paybillremark', 'paybillbankaccount');
            return this.sendResponse(res, 'con', 'Enter Remark\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.paybillbankaccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response.length > 100) {
            return this.sendResponse(res, 'con', 'Remark too long. Please enter a shorter remark (max 100 characters):\n\n0. Back\n00. Exit');
        }

        sessionData.paybill_remark = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.paybilltransaction(customer, msisdn, session, shortcode, null, res);
    }

    async paybilltransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        // DEBUG: Log all session data
        this.logger.info(`[PAYBILL-DEBUG] Session data: ${JSON.stringify({
            paybill_number: sessionData.paybill_number,
            paybill_account: sessionData.paybill_account,
            paybill_name: sessionData.paybill_name,
            paybill_amount: sessionData.paybill_amount,
            paybill_bank_account: sessionData.paybill_bank_account,
            paybill_remark: sessionData.paybill_remark
        })}`);

        if (!response) {
            await this.updateSessionMenu(session, 'paybilltransaction', 'paybillremark');

            const amount = sessionData.paybill_amount;
            const bankAccount = sessionData.paybill_bank_account;
            const paybillName = sessionData.paybill_name || 'Unknown PayBill';
            const paybillNumber = sessionData.paybill_number;
            const accountNumber = sessionData.paybill_account || 'Unknown Account';
            const remark = sessionData.paybill_remark;

            // Get transaction charges
            const charges = await this.getTransactionCharges(customer, msisdn, session, shortcode, this.merchantTransaction, amount);

            const message = `Enter PIN to pay Ksh ${amount} to ${paybillName} account number ${accountNumber} from account ${bankAccount}. Remark: ${remark}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        // ... rest of the method remains the same
    }

    // ========== HELPER METHODS ==========

    async validatePaybillAndAccount(customer, msisdn, session, shortcode, paybillNumber, accountNumber) {
        const customerid = customer.customerid;
        const data = `MERCHANTID:${this.merchantValidation}:ACCOUNTID:${accountNumber}:METERNUMBER:${accountNumber}:INFOFIELD1:4:INFOFIELD2:${accountNumber}:INFOFIELD4:PAYBILL:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:ACTION:GETNAME`;

        this.logger.info(`[PAYBILL] Validating paybill: ${paybillNumber}, account: ${accountNumber}`);
        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    async processPaybillTransaction(customer, msisdn, session, shortcode, sessionData, pin) {
        const customerid = customer.customerid;
        const paybillNumber = sessionData.paybill_number;
        const accountNumber = sessionData.paybill_account;
        const paybillName = sessionData.paybill_name;
        const remark = sessionData.paybill_remark;
        const amount = sessionData.paybill_amount;
        const bankaccountid = sessionData.paybill_bank_account;

        const data = `MERCHANTID:${this.merchantTransaction}:BANKACCOUNTID:${bankaccountid}:ACCOUNTID:${paybillNumber}:AMOUNT:${amount}:INFOFIELD1:${paybillNumber}:INFOFIELD2:${accountNumber}:INFOFIELD3:${remark}:INFOFIELD4:PAYBILL:INFOFIELD5:${paybillName}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:ACTION:PAYBILL:TMPIN:${pin}`;

        this.logger.info(`[PAYBILL] Processing paybill transaction:`, {
            paybillNumber,
            accountNumber,
            paybillName,
            amount,
            bankaccountid,
            remark
        });

        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    validatePaybillNumber(paybillNumber) {
        // PayBill numbers are typically numeric
        return /^\d+$/.test(paybillNumber) && paybillNumber.length >= 4 && paybillNumber.length <= 10;
    }

    validateAccountNumber(accountNumber) {
        // Account numbers can be alphanumeric
        return /^[a-zA-Z0-9]+$/.test(accountNumber) && accountNumber.length >= 1 && accountNumber.length <= 20;
    }

    cleanPaybillName(paybillName) {
        // Clean up paybill name - remove extra spaces and trim
        if (!paybillName) return 'Unknown PayBill';
        return paybillName.replace(/\s+/g, ' ').trim();
    }

    async getTransactionCharges(customer, msisdn, session, shortcode, merchantid, amount) {
        const formid = 'O-GetBankMerchantCharges';
        const data = `FORMID:${formid}:MERCHANTID:${merchantid}:AMOUNT:${amount}:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

        try {
            const response = await apiService.makeRequest(formid, data, msisdn, session, shortcode);

            if (response.STATUS === '000' || response.STATUS === 'OK') {
                const charge = response.DATA.split('|')[1] || '0';
                return `Charge: Ksh ${charge}`;
            }
        } catch (error) {
            this.logger.error(`[PAYBILL] Get charges error: ${error.message}`);
        }

        return 'Charge: Ksh 0';
    }

    clearPaybillSession(session) {
        this.ussdService.getSession(session).then(sessionData => {
            delete sessionData.paybill_number;
            delete sessionData.paybill_account;
            delete sessionData.paybill_name;
            delete sessionData.paybill_amount;
            delete sessionData.paybill_bank_account;
            delete sessionData.paybill_remark;
            this.ussdService.saveSession(session, sessionData);
        });
    }

    async handleBackToMobileMoney(customer, msisdn, session, shortcode, res) {
        const featureManager = require('./index');
        return await featureManager.execute('mobileMoney', 'mobilemoney', customer, msisdn, session, shortcode, null, res);
    }
}

module.exports = new PaybillService();