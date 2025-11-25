const baseFeature = require('./baseFeature');
const apiService = require('../services/apiService');

class BuyFloatService extends baseFeature {
    constructor() {
        super();
        this.merchantValidation = 'AGENTVALIDATION';
        this.merchantTransaction = '006001014';
    }

    async buyfloat(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'buyfloat', 'mobilemoney');
            return this.sendResponse(res, 'con', 'Enter Agent Number\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.handleBackToMobileMoney(customer, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAgentNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid agent number. Please enter a valid agent number:\n\n0. Back\n00. Exit');
        }

        const sessionData = await this.ussdService.getSession(session);
        sessionData.agent_number = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.buyfloatstore(customer, msisdn, session, shortcode, null, res);
    }

    async buyfloatstore(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buyfloatstore', 'buyfloat');
            return this.sendResponse(res, 'con', 'Enter Store Number\n\n0. Back\n00. Exit');
        }

        // Check if we're in error state
        if (sessionData.buyfloatstore_error) {
            if (response === '0') {
                delete sessionData.buyfloatstore_error;
                await this.ussdService.saveSession(session, sessionData);
                return await this.buyfloat(customer, msisdn, session, shortcode, null, res);
            }
            if (response === '00') {
                return await this.handleExit(session, res);
            }
        }

        // Check if we're in confirmation state
        if (sessionData.buyfloatstore_confirmed) {
            if (response === '1') {
                return await this.buyfloatamount(customer, msisdn, session, shortcode, null, res);
            } else if (response === '2') {
                return await this.handleBackToMobileMoney(customer, msisdn, session, shortcode, res);
            } else {
                return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel');
            }
        }

        if (response === '0') {
            return await this.buyfloat(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateStoreNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid store number. Please enter a valid store number:\n\n0. Back\n00. Exit');
        }

        // Validate agent and store
        try {
            const validationResult = await this.validateAgentAndStore(customer, msisdn, session, shortcode, sessionData.agent_number, response);

            if (validationResult.STATUS === '000' || validationResult.STATUS === 'OK') {
                const agentName = this.cleanAgentName(validationResult.DATA);
                
                sessionData.store_number = response;
                sessionData.agent_name = agentName;
                sessionData.buyfloatstore_confirmed = true;
                await this.ussdService.saveSession(session, sessionData);

                const message = `Confirm agent's name\n\n${agentName}\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
                return this.sendResponse(res, 'con', message);
            } else {
                sessionData.buyfloatstore_error = true;
                await this.ussdService.saveSession(session, sessionData);

                const errorMessage = validationResult.DATA || 'Agent validation failed. Please check the agent number and try again.';
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }
        } catch (error) {
            this.logger.error(`[BUYFLOAT] Agent validation error: ${error.message}`);
            sessionData.buyfloatstore_error = true;
            await this.ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Service temporarily unavailable. Please try again later.\n\n0. Back\n00. Exit');
        }
    }

    async buyfloatamount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buyfloatamount', 'buyfloatstore');
            return this.sendResponse(res, 'con', 'Enter Amount\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.buyfloatstore(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.float_amount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.buyfloatbankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async buyfloatbankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buyfloatbankaccount', 'buyfloatamount');

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
            return await this.buyfloatamount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.float_bank_account = accounts[selectedIndex];
            await this.ussdService.saveSession(session, sessionData);

            return await this.buyfloatremark(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async buyfloatremark(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buyfloatremark', 'buyfloatbankaccount');
            return this.sendResponse(res, 'con', 'Enter Remark\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.buyfloatbankaccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response.length > 100) {
            return this.sendResponse(res, 'con', 'Remark too long. Please enter a shorter remark (max 100 characters):\n\n0. Back\n00. Exit');
        }

        sessionData.float_remark = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.buyfloattransaction(customer, msisdn, session, shortcode, null, res);
    }

    async buyfloattransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buyfloattransaction', 'buyfloatremark');

            const amount = sessionData.float_amount;
            const bankAccount = sessionData.float_bank_account;
            const agentName = sessionData.agent_name;
            const storeNumber = sessionData.store_number;
            const remark = sessionData.float_remark;

            // Get transaction charges
            const charges = await this.getTransactionCharges(customer, msisdn, session, shortcode, this.merchantTransaction, amount);

            const message = `Enter PIN to buy Ksh ${amount} float for agent ${agentName} store ${storeNumber} from account ${bankAccount}. Remark: ${remark}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.buyfloatremark(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate PIN
        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.processBuyFloatTransaction(customer, msisdn, session, shortcode, sessionData, response);

            if (result.STATUS === '000' || result.STATUS === 'OK') {
                // Clear session data
                this.clearBuyFloatSession(session);

                const successMessage = result.DATA || 'Float purchase completed successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Transaction failed. Please try again.';
                return this.sendResponse(res, 'end', errorMessage);
            }
        } catch (error) {
            this.logger.error(`[BUYFLOAT] Transaction error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    // ========== HELPER METHODS ==========

    async validateAgentAndStore(customer, msisdn, session, shortcode, agentNumber, storeNumber) {
        const customerid = customer.customerid;
        const data = `MERCHANTID:${this.merchantValidation}:ACCOUNTID:${agentNumber}:INFOFIELD1:4:INFOFIELD5:${agentNumber}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:ACTION:GETNAME`;

        this.logger.info(`[BUYFLOAT] Validating agent: ${agentNumber}, store: ${storeNumber}`);
        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    async processBuyFloatTransaction(customer, msisdn, session, shortcode, sessionData, pin) {
        const customerid = customer.customerid;
        const store = sessionData.store_number;
        const agentName = sessionData.agent_name;
        const agentNumber = sessionData.agent_number;
        const remark = sessionData.float_remark;
        const amount = sessionData.float_amount;
        const bankaccountid = sessionData.float_bank_account;

        const data = `MERCHANTID:${this.merchantTransaction}:BANKACCOUNTID:${bankaccountid}:ACCOUNTID:${agentNumber}:AMOUNT:${amount}:INFOFIELD1:${agentNumber}:INFOFIELD2:${store}:INFOFIELD3:${remark}:INFOFIELD4:BUYFLOAT:INFOFIELD5:${agentName}:INFOFIELD6:${store}:INFOFIELD8:${remark}:MESSAGE:${remark}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:ACTION:PAYBILL:TMPIN:${pin}`;

        this.logger.info(`[BUYFLOAT] Processing buy float transaction:`, {
            agentNumber,
            store,
            agentName,
            amount,
            bankaccountid,
            remark
        });

        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    validateAgentNumber(agentNumber) {
        // Agent numbers are typically mobile numbers or specific agent codes
        return /^\d+$/.test(agentNumber) && agentNumber.length >= 8 && agentNumber.length <= 15;
    }

    validateStoreNumber(storeNumber) {
        // Store numbers can be alphanumeric
        return /^[a-zA-Z0-9]+$/.test(storeNumber) && storeNumber.length >= 1 && storeNumber.length <= 20;
    }

    cleanAgentName(agentName) {
        // Clean up agent name - remove extra spaces and trim
        if (!agentName) return 'Unknown Agent';
        return agentName.replace(/\s+/g, ' ').trim();
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
            this.logger.error(`[BUYFLOAT] Get charges error: ${error.message}`);
        }

        return 'Charge: Ksh 0';
    }

    clearBuyFloatSession(session) {
        this.ussdService.getSession(session).then(sessionData => {
            delete sessionData.agent_number;
            delete sessionData.store_number;
            delete sessionData.agent_name;
            delete sessionData.float_amount;
            delete sessionData.float_bank_account;
            delete sessionData.float_remark;
            delete sessionData.buyfloatstore_error;
            delete sessionData.buyfloatstore_confirmed;
            this.ussdService.saveSession(session, sessionData);
        });
    }

    async handleBackToMobileMoney(customer, msisdn, session, shortcode, res) {
        const featureManager = require('./index');
        return await featureManager.execute('mobileMoney', 'mobilemoney', customer, msisdn, session, shortcode, null, res);
    }
}

module.exports = new BuyFloatService();