const baseFeature = require('./baseFeature');
const apiService = require('../services/apiService');

class MobileMoneyService extends baseFeature {
    constructor() {
        super();
        this.merchantWithdraw = process.env.MERCHANT_WITHDRAW || '006001001';
        this.merchantDeposit = process.env.MERCHANT_DEPOSIT || 'MPESASTKPUSH';
    }

    async mobilemoney(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'mobilemoney', 'mobilebanking');
            return this.displayMenu('mobilemoney', res);
        }

        if (response === '0') {
            return await this.handleBackToHome(customer, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const menuHandlers = {
            '1': () => this.withdraw(customer, msisdn, session, shortcode, null, res),
            '2': () => this.deposit(customer, msisdn, session, shortcode, null, res),
            '3': () => this.buyfloat(customer, msisdn, session, shortcode, null, res),
            '4': () => this.buygoods(customer, msisdn, session, shortcode, null, res),
            '5': () => this.paybill(customer, msisdn, session, shortcode, null, res)
        };

        if (menuHandlers[response]) {
            return await menuHandlers[response]();
        }

        return this.displayMenu('mobilemoney', res, 'Invalid selection. Please try again.\n\n');
    }

    // account to m-pesa 
    async withdraw(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'withdraw', 'mobilemoney');
            return this.displayMenu('withdraw', res);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'mobileMoney', 'mobilemoney', msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const menuHandlers = {
            '1': () => this.withdrawOwnNumber(customer, msisdn, session, shortcode, null, res),
            '2': () => this.withdrawOtherNumber(customer, msisdn, session, shortcode, null, res),
            '3': () => this.withdrawBeneficiary(customer, msisdn, session, shortcode, null, res)
        };

        if (menuHandlers[response]) {
            if (response === '1') {
                sessionData.withdraw_type = 'own';
                sessionData.withdraw_msisdn = msisdn;
            } else if (response === '2') {
                sessionData.withdraw_type = 'other';
            } else if (response === '3') {
                sessionData.withdraw_type = 'beneficiary';
            }

            await this.ussdService.saveSession(session, sessionData);
            return await menuHandlers[response]();
        }

        return this.displayMenu('withdraw', res, 'Invalid selection. Please try again.\n\n');
    }

    async withdrawOwnNumber(customer, msisdn, session, shortcode, response, res) {
        return await this.withdrawAmount(customer, msisdn, session, shortcode, null, res);
    }

    async withdrawOtherNumber(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'withdrawmsisdn', 'withdraw');
            return this.sendResponse(res, 'con', 'Enter the M-PESA mobile number\n\nFormat: 07_ or 01_\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.withdraw(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateMobileNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid M-PESA number (07_ or 01_):\n\n0. Back\n00. Exit');
        }

        sessionData.withdraw_msisdn = this.formatMobileNumber(response);
        await this.ussdService.saveSession(session, sessionData);

        return await this.withdrawAmount(customer, msisdn, session, shortcode, null, res);
    }

    async withdrawBeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'withdrawbeneficiary', 'withdraw');

            try {
                const beneficiaries = await this.getMpesaBeneficiaries(customer, msisdn, session, shortcode);

                if (!beneficiaries || beneficiaries.length === 0) {
                    const message = 'No saved M-PESA beneficiaries found.\n\n0. Back\n00. Exit';
                    return this.sendResponse(res, 'con', message);
                }

                let message = 'Select M-PESA beneficiary:\n\n';
                beneficiaries.forEach((beneficiary, index) => {
                    const displayMobile = this.formatDisplayMobile(beneficiary.mobile);
                    message += `${index + 1}. ${beneficiary.name} (${displayMobile})\n`;
                });

                message += '\n0. Back\n00. Exit';
                sessionData.beneficiaries = beneficiaries;
                await this.ussdService.saveSession(session, sessionData);

                return this.sendResponse(res, 'con', message);
            } catch (error) {
                this.logger.error(`[MOBILEMONEY] Get beneficiaries error: ${error.message}`);
                return this.sendResponse(res, 'con', 'Unable to fetch beneficiaries. Please try again later.\n\n0. Back\n00. Exit');
            }
        }

        if (response === '0') {
            return await this.withdraw(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const beneficiaries = sessionData.beneficiaries || [];

        if (beneficiaries[selectedIndex]) {
            const beneficiary = beneficiaries[selectedIndex];
            sessionData.withdraw_msisdn = beneficiary.mobile;
            await this.ussdService.saveSession(session, sessionData);

            return await this.withdrawAmount(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async withdrawAmount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'withdrawamount',
                sessionData.withdraw_type === 'other' ? 'withdrawmsisdn' :
                    sessionData.withdraw_type === 'beneficiary' ? 'withdrawbeneficiary' : 'withdraw');

            return this.sendResponse(res, 'con', 'Enter Amount:\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            if (sessionData.withdraw_type === 'other') {
                return await this.withdrawOtherNumber(customer, msisdn, session, shortcode, null, res);
            } else if (sessionData.withdraw_type === 'beneficiary') {
                return await this.withdrawBeneficiary(customer, msisdn, session, shortcode, null, res);
            } else {
                return await this.withdraw(customer, msisdn, session, shortcode, null, res);
            }
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.withdraw_amount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.withdrawBankAccount(customer, msisdn, session, shortcode, null, res);
    }

    async withdrawBankAccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'withdrawbankaccount', 'withdrawamount'); 

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
            return await this.withdrawAmount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.withdraw_bank_account = accounts[selectedIndex];
            await this.ussdService.saveSession(session, sessionData);

            return await this.withdrawTransaction(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async withdrawTransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'withdrawtransaction', 'withdrawbankaccount');

            const amount = sessionData.withdraw_amount;
            const bankAccount = sessionData.withdraw_bank_account;
            const mobileNumber = this.formatDisplayMobile(sessionData.withdraw_msisdn);

            const charges = await this.getTransactionCharges(customer, msisdn, session, shortcode, '006001001', amount);

            const message = `Enter PIN to send Ksh ${amount} to M-PESA ${mobileNumber} from account ${bankAccount}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.withdrawBankAccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate PIN
        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.processWithdrawTransaction(customer, msisdn, session, shortcode, sessionData, response);

            if (result.STATUS === '000' || result.STATUS === 'OK') {
                this.clearWithdrawSession(session);

                const successMessage = result.DATA || 'Transaction completed successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Transaction failed. Please try again.';
                return this.sendResponse(res, 'end', errorMessage);
            }
        } catch (error) {
            this.logger.error(`[MOBILEMONEY] Withdraw transaction error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    // Mpesa to account
    async deposit(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'deposit', 'mobilemoney');
            return this.sendResponse(res, 'con', 'Enter Amount:\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'mobileMoney', 'mobilemoney', msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.deposit_amount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.depositBankAccount(customer, msisdn, session, shortcode, null, res);
    }

    async depositBankAccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'depositbankaccount', 'deposit');

            const accounts = customer.accounts || [];
            if (accounts.length === 0) {
                return this.sendResponse(res, 'end', 'No accounts found for this transaction.');
            }

            let message = 'Select account to deposit to:\n\n';
            accounts.forEach((account, index) => {
                message += `${index + 1}. ${account}\n`;
            });

            message += '\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'mobileMoney', 'deposit', msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.deposit_bank_account = accounts[selectedIndex];
            await this.ussdService.saveSession(session, sessionData);

            return await this.depositTransaction(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async depositTransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'deposittransaction', 'depositbankaccount');

            const amount = sessionData.deposit_amount;
            const bankAccount = sessionData.deposit_bank_account;
            const mobileNumber = this.formatDisplayMobile(msisdn);

            const message = `Confirm you want to deposit Ksh ${amount} to account ${bankAccount} from your M-PESA ${mobileNumber}\n\n1. Confirm\n2. Cancel\n
            \n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.depositBankAccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response === '2') {
            return await this.deposit(customer, msisdn, session, shortcode, null, res);
        }

        if (response !== '1') {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel\n\n00. Exit');
        }

        try {
            const result = await this.processDepositTransaction(customer, msisdn, session, shortcode, sessionData);

            if (result.STATUS === '000' || result.STATUS === 'OK') {
                this.clearDepositSession(session);

                const successMessage = 'You will receive an M-PESA prompt shortly to complete your deposit. Please check your phone.';
                return this.sendResponse(res, 'end', successMessage);
            } else {
                const errorMessage = result.DATA || 'Transaction failed. Please try again.';
                return this.sendResponse(res, 'end', errorMessage);
            }
        } catch (error) {
            this.logger.error(`[MOBILEMONEY] Deposit transaction error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }
    async manageWithdrawBeneficiary(customer, msisdn, session, shortcode, response, res) {
        const beneficiaryService = require('./beneficiaryService');
        return await beneficiaryService.managewithdrawbeneficiary(customer, msisdn, session, shortcode, response, res);
    }

    async buyfloat(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[MOBILEMONEY] buyfloat called with response: "${response}"`);

        // If no response, we're entering buyfloat for the first time
        if (!response) {
            await this.updateSessionMenu(session, 'buyfloat', 'mobilemoney');
            const featureManager = require('./index');
            return await featureManager.execute('buyfloat', 'buyfloat', customer, msisdn, session, shortcode, null, res); 
        }

        // If there's a response, pass it directly to buyfloat feature
        const featureManager = require('./index');
        return await featureManager.execute('buyfloat', 'buyfloat', customer, msisdn, session, shortcode, response, res); 
    }

    async buygoods(customer, msisdn, session, shortcode, response, res) {
        const featureManager = require('./index');
        return await featureManager.execute('buygoods', 'buygoods', customer, msisdn, session, shortcode, response, res);
    }

    async paybill(customer, msisdn, session, shortcode, response, res) {
        const featureManager = require('./index');
        return await featureManager.execute('paybill', 'paybill', customer, msisdn, session, shortcode, response, res);
    }

    async getMpesaBeneficiaries(customer, msisdn, session, shortcode) {
        const formid = 'O-GetUtilityAlias';
        const data = `FORMID:${formid}:SERVICETYPE:MMONEY:SERVICEID:MPESA:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

        try {
            const response = await apiService.makeRequest(formid, data, msisdn, session, shortcode);

            if (response.STATUS === '000' || response.STATUS === 'OK') {
                return this.parseBeneficiaries(response.DATA);
            } else {
                this.logger.warn(`[MOBILEMONEY] Get beneficiaries failed: ${response.DATA}`);
                return [];
            }
        } catch (error) {
            this.logger.error(`[MOBILEMONEY] Get beneficiaries error: ${error.message}`);
            throw error;
        }
    }

    parseBeneficiaries(data) {
        if (!data) return [];

        try {
            const beneficiaries = [];
            const items = data.split(';');

            for (const item of items) {
                if (item.trim()) {
                    const parts = item.split(',');
                    if (parts.length >= 2) {
                        const name = parts[parts.length - 1];
                        const mobile = parts[parts.length - 2];
                        if (name && mobile) {
                            beneficiaries.push({
                                name: name.trim(),
                                mobile: mobile.trim(),
                                type: 'MPESA'
                            });
                        }
                    }
                }
            }

            return beneficiaries;
        } catch (error) {
            this.logger.error(`[MOBILEMONEY] Parse beneficiaries error: ${error.message}`);
            return [];
        }
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
            this.logger.error(`[MOBILEMONEY] Get charges error: ${error.message}`);
        }

        return 'Charge: Ksh 0';
    }

    async processWithdrawTransaction(customer, msisdn, session, shortcode, sessionData, pin) {
        const merchantid = this.merchantWithdraw;
        const customerid = customer.customerid;
        const amount = sessionData.withdraw_amount;
        const accountid = sessionData.withdraw_msisdn;
        const bankaccountid = sessionData.withdraw_bank_account;


        const data = `MERCHANTID:${merchantid}:BANKACCOUNTID:${bankaccountid}:ACCOUNTID:${accountid}:AMOUNT:${amount}:CUSTOMERID:${customerid}:ACTION:PAYBILL:TMPIN:${pin}`;

        this.logger.info(`[MOBILEMONEY] Transaction Details:`, {
            merchantid,
            bankaccountid,
            accountid,
            amount,
            customerid,
            data_payload: data
        });

        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    async processDepositTransaction(customer, msisdn, session, shortcode, sessionData) {
        const merchantid = 'MPESASTKPUSH';
        const customerid = customer.customerid;
        const amount = sessionData.deposit_amount;
        const bankaccountid = sessionData.deposit_bank_account;

        const data = `MERCHANTID:${merchantid}:BANKACCOUNTID:${bankaccountid}:ACCOUNTID:${bankaccountid}:AMOUNT:${amount}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:INFOFIELD9:${msisdn}:ACTION:DEPOSIT`;

        this.logger.info(`[MOBILEMONEY] Processing deposit transaction: ${JSON.stringify(sessionData)}`);
        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    clearWithdrawSession(session) {
        this.ussdService.getSession(session).then(sessionData => {
            delete sessionData.withdraw_type;
            delete sessionData.withdraw_msisdn;
            delete sessionData.withdraw_amount;
            delete sessionData.withdraw_bank_account;
            delete sessionData.beneficiaries;
            this.ussdService.saveSession(session, sessionData);
        });
    }

    clearDepositSession(session) {
        this.ussdService.getSession(session).then(sessionData => {
            delete sessionData.deposit_amount;
            delete sessionData.deposit_bank_account;
            this.ussdService.saveSession(session, sessionData);
        });
    }

    async handleBackToHome(customer, msisdn, session, shortcode, res) {
        const featureManager = require('./index');
        return await featureManager.execute('navigation', 'mobilebanking', customer, msisdn, session, shortcode, null, res);
    }
}

module.exports = new MobileMoneyService();