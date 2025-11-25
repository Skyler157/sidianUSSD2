const baseFeature = require('./baseFeature');
const apiService = require('../services/apiService');

class AirtimeService extends baseFeature {
    constructor() {
        super();
        this.networks = {
            'Safaricom': 'CSSAFCOMKE',
            'Airtel': 'CSAIRTELKE', 
            'Telkom': 'CSORANGEKE'
        };
    }

    async airtime(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[AIRTIME] Entry - Response: "${response}", Session: ${session}`);

        if (!response) {
            await this.updateSessionMenu(session, 'airtime', 'mobilebanking');
            
            const message = 'Airtime\n\n1. Own Number\n2. Other Number\n3. Saved Beneficiary\n\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.handleBackToHome(customer, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const menuHandlers = {
            '1': () => this.handleOwnNumber(customer, msisdn, session, shortcode, res),
            '2': () => this.handleOtherNumber(customer, msisdn, session, shortcode, res),
            '3': () => this.handleSavedBeneficiary(customer, msisdn, session, shortcode, res)
        };

        if (menuHandlers[response]) {
            return await menuHandlers[response]();
        }

        return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Own Number\n2. Other Number\n3. Saved Beneficiary\n\n0. Back\n00. Exit');
    }

    async handleOwnNumber(customer, msisdn, session, shortcode, res) {
        const sessionData = await this.ussdService.getSession(session);
        sessionData.airtime_mode = 'own';
        sessionData.airtimemsisdn = msisdn;
        sessionData.airtime_method = 'airtimeamount';
        await this.ussdService.saveSession(session, sessionData);

        return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
    }

    async handleOtherNumber(customer, msisdn, session, shortcode, res) {
        const sessionData = await this.ussdService.getSession(session);
        sessionData.airtime_mode = 'other';
        sessionData.airtime_method = 'airtimemsisdn';
        await this.ussdService.saveSession(session, sessionData);

        return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
    }

    async handleSavedBeneficiary(customer, msisdn, session, shortcode, res) {
        const sessionData = await this.ussdService.getSession(session);
        sessionData.airtime_mode = 'beneficiary';
        sessionData.airtime_method = 'airtimebeneficiary';
        await this.ussdService.saveSession(session, sessionData);

        return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
    }

    async handleManageBeneficiaries(customer, msisdn, session, shortcode, res) {
        const sessionData = await this.ussdService.getSession(session);
        sessionData.airtime_mode = 'managebeneficiary';
        sessionData.airtime_method = 'manageairtimebeneficiary';
        await this.ussdService.saveSession(session, sessionData);

        return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
    }

    async airtimenetwork(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'airtimenetwork', 'airtime');
            
            let message = 'Select Network\n\n';
            const mode = sessionData.airtime_mode;
            
            if (mode === 'own') {
                message += '1. Safaricom\n2. Airtel\n';
            } else {
                message += '1. Safaricom\n2. Airtel\n3. Telkom\n';
            }
            
            message += '\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.airtime(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const mode = sessionData.airtime_mode;
        let networkOptions = [];

        if (mode === 'own') {
            networkOptions = [
                ['Safaricom', 'CSSAFCOMKE'],
                ['Airtel', 'CSAIRTELKE']
            ];
        } else {
            networkOptions = [
                ['Safaricom', 'CSSAFCOMKE'],
                ['Airtel', 'CSAIRTELKE'],
                ['Telkom', 'CSORANGEKE']
            ];
        }

        const selectedIndex = parseInt(response) - 1;
        
        if (networkOptions[selectedIndex]) {
            const [networkName, merchantId] = networkOptions[selectedIndex];
            
            sessionData.airtimenetwork = networkName;
            sessionData.airtimenetworkid = merchantId;
            await this.ussdService.saveSession(session, sessionData);

            const nextMethod = sessionData.airtime_method;
            return await this[nextMethod](customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async airtimebeneficiary(customer, msisdn, session, shortcode, response, res) {
    const sessionData = await this.ussdService.getSession(session);

    try {
        const fetchedBeneficiaries = await this.getAirtimeBeneficiaries(customer, msisdn, session, shortcode, sessionData.airtimenetworkid);

        if (!fetchedBeneficiaries || fetchedBeneficiaries.length === 0) {
            const message = `No saved ${sessionData.airtimenetwork} airtime beneficiaries found.\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (!response) {
            await this.updateSessionMenu(session, 'airtimebeneficiary', 'airtimenetwork');
            
            let message = 'Select beneficiary:\n\n';
            fetchedBeneficiaries.forEach((beneficiary, index) => {
                const [merchantId, mobileNumber, alias] = beneficiary;
                const displayMobile = this.formatDisplayMobile(mobileNumber);
                message += `${index + 1}. ${alias} (${displayMobile})\n`;
            });

            message += '\n0. Back\n00. Exit';
            sessionData.beneficiaries = fetchedBeneficiaries; // Store in session
            await this.ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const sessionBeneficiaries = sessionData.beneficiaries || []; // Use different name

        if (sessionBeneficiaries[selectedIndex]) {
            const [merchantId, mobileNumber, alias] = sessionBeneficiaries[selectedIndex];
            sessionData.airtimemsisdn = mobileNumber;
            await this.ussdService.saveSession(session, sessionData);

            return await this.airtimeamount(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    } catch (error) {
        this.logger.error(`[AIRTIME] Get beneficiaries error: ${error.message}`);
        return this.sendResponse(res, 'con', 'Unable to fetch beneficiaries. Please try again later.\n\n0. Back\n00. Exit');
    }
}

    async airtimemsisdn(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'airtimemsisdn', 'airtimenetwork');
            
            let message = `Enter the ${sessionData.airtimenetwork} mobile number\n\nFormat: 07_ or 01_\n\n`;
            if (sessionData.airtimenetwork === 'Telkom') {
                message = `Enter the ${sessionData.airtimenetwork} mobile number\n\nFormat: 07_\n\n`;
            }
            
            message += '0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateMobileNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid mobile number:\n\n0. Back\n00. Exit');
        }

        sessionData.airtimemsisdn = this.formatMobileNumber(response);
        await this.ussdService.saveSession(session, sessionData);

        return await this.airtimeamount(customer, msisdn, session, shortcode, null, res);
    }

    async airtimeamount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'airtimeamount', 
                sessionData.airtime_mode === 'other' ? 'airtimemsisdn' :
                sessionData.airtime_mode === 'beneficiary' ? 'airtimebeneficiary' : 'airtimenetwork');
            
            return this.sendResponse(res, 'con', 'Enter Amount\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            if (sessionData.airtime_mode === 'other') {
                return await this.airtimemsisdn(customer, msisdn, session, shortcode, null, res);
            } else if (sessionData.airtime_mode === 'beneficiary') {
                return await this.airtimebeneficiary(customer, msisdn, session, shortcode, null, res);
            } else {
                return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
            }
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.airtimeamount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.airtimebankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async airtimebankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'airtimebankaccount', 'airtimeamount');

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
            return await this.airtimeamount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.airtimebankaccount = accounts[selectedIndex];
            await this.ussdService.saveSession(session, sessionData);

            return await this.airtimetransaction(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async airtimetransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'airtimetransaction', 'airtimebankaccount');

            const amount = sessionData.airtimeamount;
            const bankAccount = sessionData.airtimebankaccount;
            const network = sessionData.airtimenetwork;
            const mobileNumber = this.formatDisplayMobile(sessionData.airtimemsisdn);

            // Get transaction charges
            const charges = await this.getTransactionCharges(customer, msisdn, session, shortcode, sessionData.airtimenetworkid, amount);

            const message = `Enter PIN to buy Ksh ${amount} ${network} airtime for ${mobileNumber} from account ${bankAccount}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.airtimebankaccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate PIN
        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.processAirtimeTransaction(customer, msisdn, session, shortcode, sessionData, response);

            if (result.STATUS === '000' || result.STATUS === 'OK') {
                // Clear session data
                this.clearAirtimeSession(session);

                const successMessage = result.DATA || 'Airtime purchase completed successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Transaction failed. Please try again.';
                return this.sendResponse(res, 'end', errorMessage);
            }
        } catch (error) {
            this.logger.error(`[AIRTIME] Transaction error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    // ========== HELPER METHODS ==========

    async getAirtimeBeneficiaries(customer, msisdn, session, shortcode, merchantid) {
        const formid = 'O-GetUtilityAlias';
        const data = `FORMID:${formid}:SERVICETYPE:Airtime:SERVICEID:${merchantid}:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

        try {
            const response = await apiService.makeRequest(formid, data, msisdn, session, shortcode);

            if (response.STATUS === '000' || response.STATUS === 'OK') {
                return this.parseBeneficiaries(response.DATA);
            } else {
                this.logger.warn(`[AIRTIME] Get beneficiaries failed: ${response.DATA}`);
                return [];
            }
        } catch (error) {
            this.logger.error(`[AIRTIME] Get beneficiaries error: ${error.message}`);
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
                    if (parts.length >= 3) {
                        const merchantId = parts[0];
                        const mobileNumber = parts[1];
                        const alias = parts[2];
                        if (merchantId && mobileNumber && alias) {
                            beneficiaries.push([
                                merchantId.trim(),
                                mobileNumber.trim(),
                                alias.trim()
                            ]);
                        }
                    }
                }
            }

            return beneficiaries;
        } catch (error) {
            this.logger.error(`[AIRTIME] Parse beneficiaries error: ${error.message}`);
            return [];
        }
    }

    async processAirtimeTransaction(customer, msisdn, session, shortcode, sessionData, pin) {
        const customerid = customer.customerid;
        const amount = sessionData.airtimeamount;
        const accountid = sessionData.airtimemsisdn;
        const merchantid = sessionData.airtimenetworkid;
        const bankaccountid = sessionData.airtimebankaccount;

        const data = `MERCHANTID:${merchantid}:BANKACCOUNTID:${bankaccountid}:ACCOUNTID:${accountid}:AMOUNT:${amount}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:ACTION:PAYBILL:TMPIN:${pin}`;

        this.logger.info(`[AIRTIME] Processing airtime transaction:`, {
            merchantid,
            accountid,
            amount,
            bankaccountid
        });

        return await apiService.makeRequest('M-', data, msisdn, session, shortcode);
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
            this.logger.error(`[AIRTIME] Get charges error: ${error.message}`);
        }

        return 'Charge: Ksh 0';
    }

    clearAirtimeSession(session) {
        this.ussdService.getSession(session).then(sessionData => {
            delete sessionData.airtime_mode;
            delete sessionData.airtime_method;
            delete sessionData.airtimenetwork;
            delete sessionData.airtimenetworkid;
            delete sessionData.airtimemsisdn;
            delete sessionData.airtimeamount;
            delete sessionData.airtimebankaccount;
            delete sessionData.beneficiaries;
            this.ussdService.saveSession(session, sessionData);
        });
    }

    async handleBackToHome(customer, msisdn, session, shortcode, res) {
        const featureManager = require('./index');
        return await featureManager.execute('navigation', 'mobilebanking', customer, msisdn, session, shortcode, null, res);
    }
}

module.exports = new AirtimeService();