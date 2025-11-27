const baseFeature = require('./baseFeature');
const apiService = require('../services/apiService');

class BuyGoodsService extends baseFeature {
    constructor() {
        super();
        this.merchantValidation = 'BILLERVALIDATION';
        this.merchantTransaction = '006001013';
    }

    async buygoods(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[BUYGOODS] Entry - Response: "${response}", Session: ${session}`);

        if (!response) {
            await this.updateSessionMenu(session, 'buygoods', 'mobilemoney');
            return this.sendResponse(res, 'con', 'Enter Till Number\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.handleBackToMobileMoney(customer, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate till number
        if (!this.validateTillNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid till number. Please enter a valid till number:\n\n0. Back\n00. Exit');
        }

        try {
            const validationResult = await this.validateTill(customer, msisdn, session, shortcode, response);

            if (validationResult.STATUS === '000' || validationResult.STATUS === 'OK') {
                const tillName = this.cleanTillName(validationResult.DATA);
                
                const sessionData = await this.ussdService.getSession(session);
                sessionData.till_number = response;
                sessionData.till_name = tillName;
                await this.ussdService.saveSession(session, sessionData);

                const message = `Confirm Till Name\n\n${tillName}\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMessage = validationResult.DATA || 'Till validation failed. Please check the till number and try again.';
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }
        } catch (error) {
            this.logger.error(`[BUYGOODS] Till validation error: ${error.message}`);
            return this.sendResponse(res, 'con', 'Service temporarily unavailable. Please try again later.\n\n0. Back\n00. Exit');
        }
    }

    async buygoodsconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buygoodsconfirm', 'buygoods');
            const tillName = sessionData.till_name;
            return this.sendResponse(res, 'con', `Confirm Till Name\n\n${tillName}\n\n1. Confirm\n2. Cancel\n\n00. Exit`);
        }

        if (response === '0') {
            return await this.buygoods(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response === '1') {
            return await this.buygoodsamount(customer, msisdn, session, shortcode, null, res);
        } else if (response === '2') {
            return await this.handleBackToMobileMoney(customer, msisdn, session, shortcode, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel\n\n00. Exit');
        }
    }

    async buygoodsamount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buygoodsamount', 'buygoodsconfirm');
            return this.sendResponse(res, 'con', 'Enter Amount\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.buygoodsconfirm(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.buygoods_amount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.buygoodsbankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async buygoodsbankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buygoodsbankaccount', 'buygoodsamount');

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
            return await this.buygoodsamount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.buygoods_bank_account = accounts[selectedIndex];
            await this.ussdService.saveSession(session, sessionData);

            return await this.buygoodsremark(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async buygoodsremark(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buygoodsremark', 'buygoodsbankaccount');
            return this.sendResponse(res, 'con', 'Enter Remark\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            return await this.buygoodsbankaccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response.length > 100) {
            return this.sendResponse(res, 'con', 'Remark too long. Please enter a shorter remark (max 100 characters):\n\n0. Back\n00. Exit');
        }

        sessionData.buygoods_remark = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.buygoodstransaction(customer, msisdn, session, shortcode, null, res);
    }

    async buygoodstransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'buygoodstransaction', 'buygoodsremark');

            const amount = sessionData.buygoods_amount;
            const bankAccount = sessionData.buygoods_bank_account;
            const tillName = sessionData.till_name;
            const tillNumber = sessionData.till_number;
            const remark = sessionData.buygoods_remark;

            // Get transaction charges
            const charges = await this.getTransactionCharges(customer, msisdn, session, shortcode, this.merchantTransaction, amount);

            const message = `Enter PIN to buy Ksh ${amount} goods from ${tillName} (${tillNumber}) with account ${bankAccount}. Remark: ${remark}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.buygoodsremark(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate PIN
        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.processBuyGoodsTransaction(customer, msisdn, session, shortcode, sessionData, response);

            if (result.STATUS === '000' || result.STATUS === 'OK') {
                this.clearBuyGoodsSession(session);

                const successMessage = result.DATA || 'Goods purchase completed successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Transaction failed. Please try again.';
                return this.sendResponse(res, 'end', errorMessage);
            }
        } catch (error) {
            this.logger.error(`[BUYGOODS] Transaction error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }


    async validateTill(customer, msisdn, session, shortcode, tillNumber) {
        const customerid = customer.customerid;
        const data = `MERCHANTID:${this.merchantValidation}:ACCOUNTID:${tillNumber}:METERNUMBER:${tillNumber}:INFOFIELD1:2:INFOFIELD2:${tillNumber}:INFOFIELD4:TILL:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:ACTION:GETNAME`;

        this.logger.info(`[BUYGOODS] Validating till: ${tillNumber}`);
        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    async processBuyGoodsTransaction(customer, msisdn, session, shortcode, sessionData, pin) {
        const customerid = customer.customerid;
        const tillNumber = sessionData.till_number;
        const tillName = sessionData.till_name;
        const remark = sessionData.buygoods_remark;
        const amount = sessionData.buygoods_amount;
        const bankaccountid = sessionData.buygoods_bank_account;

        const data = `MERCHANTID:${this.merchantTransaction}:BANKACCOUNTID:${bankaccountid}:ACCOUNTID:${tillNumber}:AMOUNT:${amount}:INFOFIELD1:${tillNumber}:INFOFIELD3:${remark}:INFOFIELD4:TILL:INFOFIELD5:${tillName}:INFOFIELD8:${remark}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:ACTION:PAYBILL:TMPIN:${pin}`;

        this.logger.info(`[BUYGOODS] Processing buy goods transaction:`, {
            tillNumber,
            tillName,
            amount,
            bankaccountid,
            remark
        });

        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
    }

    validateTillNumber(tillNumber) {
        return /^\d+$/.test(tillNumber) && tillNumber.length >= 5 && tillNumber.length <= 15;
    }

    cleanTillName(tillName) {
        if (!tillName) return 'Unknown Till';
        return tillName.replace(/\s+/g, ' ').trim();
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
            this.logger.error(`[BUYGOODS] Get charges error: ${error.message}`);
        }

        return 'Charge: Ksh 0';
    }

    clearBuyGoodsSession(session) {
        this.ussdService.getSession(session).then(sessionData => {
            delete sessionData.till_number;
            delete sessionData.till_name;
            delete sessionData.buygoods_amount;
            delete sessionData.buygoods_bank_account;
            delete sessionData.buygoods_remark;
            this.ussdService.saveSession(session, sessionData);
        });
    }

    async handleBackToMobileMoney(customer, msisdn, session, shortcode, res) {
        const featureManager = require('./index');
        return await featureManager.execute('mobileMoney', 'mobilemoney', customer, msisdn, session, shortcode, null, res);
    }
}

module.exports = new BuyGoodsService();