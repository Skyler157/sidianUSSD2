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

        await this.updateSessionMenu(session, 'airtimenetwork', 'airtime');

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
        let sessionData = await this.ussdService.getSession(session);

        this.logger.info(`[AIRTIME DEBUG] Response: "${response}"`);
        this.logger.info(`[AIRTIME DEBUG] Current menu before update: ${sessionData.current_menu}`);
        this.logger.info(`[AIRTIME DEBUG] Airtime mode: ${sessionData.airtime_mode}`);
        this.logger.info(`[AIRTIME DEBUG] Airtime network: ${sessionData.airtimenetwork}`);

        try {

            if (!response) {
                this.logger.info(`[AIRTIME DEBUG] First time entering airtimebeneficiary`);


                await this.updateSessionMenu(session, 'airtimebeneficiary', 'airtimenetwork');

                sessionData = await this.ussdService.getSession(session);

                const fetchedBeneficiaries = await this.getAirtimeBeneficiaries(customer, msisdn, session, shortcode, sessionData.airtimenetworkid);

                this.logger.info(`[AIRTIME] Fetched ${fetchedBeneficiaries.length} beneficiaries for network: ${sessionData.airtimenetwork}`);

                if (!fetchedBeneficiaries || fetchedBeneficiaries.length === 0) {
                    const message = `No saved ${sessionData.airtimenetwork} airtime beneficiaries found.\n\n0. Back\n00. Exit`;
                    return this.sendResponse(res, 'con', message);
                }

                let message = 'Select beneficiary:\n\n';
                fetchedBeneficiaries.forEach((beneficiary, index) => {
                    const [merchantId, mobileNumber, alias] = beneficiary;
                    const displayMobile = this.formatDisplayMobile(mobileNumber);
                    message += `${index + 1}. ${alias} (${displayMobile})\n`;
                });

                message += '\n0. Back\n00. Exit';

                sessionData.airtime_beneficiaries = fetchedBeneficiaries;
                await this.ussdService.saveSession(session, sessionData);

                this.logger.info(`[AIRTIME DEBUG] Showing beneficiary selection menu`);
                return this.sendResponse(res, 'con', message);
            }

            if (response === '0') {
                this.logger.info(`[AIRTIME DEBUG] Back navigation from airtimebeneficiary`);
                return await this.airtimenetwork(customer, msisdn, session, shortcode, null, res);
            }

            if (response === '00') {
                this.logger.info(`[AIRTIME DEBUG] Exit from airtimebeneficiary`);
                return await this.handleExit(session, res);
            }

            this.logger.info(`[AIRTIME DEBUG] Processing beneficiary selection: ${response}`);

            const selectedIndex = parseInt(response) - 1;
            const sessionBeneficiaries = sessionData.airtime_beneficiaries || [];

            this.logger.info(`[AIRTIME DEBUG] Selected index: ${selectedIndex}, Available beneficiaries: ${sessionBeneficiaries.length}`);

            if (sessionBeneficiaries[selectedIndex]) {
                const [merchantId, mobileNumber, alias] = sessionBeneficiaries[selectedIndex];

                this.logger.info(`[AIRTIME DEBUG] Selected beneficiary: ${alias} (${mobileNumber})`);

                sessionData.airtimemsisdn = mobileNumber;
                await this.ussdService.saveSession(session, sessionData);

                await this.updateSessionMenu(session, 'airtimeamount', 'airtimebeneficiary');

                this.logger.info(`[AIRTIME DEBUG] Proceeding to airtimeamount with mobile: ${mobileNumber}`);

                return await this.airtimeamount(customer, msisdn, session, shortcode, null, res);
            } else {
                this.logger.warn(`[AIRTIME DEBUG] Invalid beneficiary selection: ${response}`);
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
                await this.clearAirtimeSession(session);

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


    async getAirtimeBeneficiaries(customer, msisdn, session, shortcode, merchantid) {
        try {
            const response = await this.ussdService.getAirtimeBeneficiaries(customer, merchantid, msisdn, session, shortcode);

            if (response.STATUS === '000' || response.STATUS === 'OK') {
                return this.ussdService.parseAirtimeBeneficiaries(response);
            } else {
                this.logger.warn(`[AIRTIME] Get beneficiaries failed: ${response.DATA}`);
                return [];
            }
        } catch (error) {
            this.logger.error(`[AIRTIME] Get beneficiaries error: ${error.message}`);
            throw error;
        }
    }

    async processAirtimeTransaction(customer, msisdn, session, shortcode, sessionData, pin) {
        const customerid = customer.customerid;
        const amount = sessionData.airtimeamount;
        const accountid = sessionData.airtimemsisdn;
        const merchantid = sessionData.airtimenetworkid;
        const bankaccountid = sessionData.airtimebankaccount;

        this.logger.info(`[AIRTIME] Processing airtime transaction:`, {
            merchantid,
            accountid,
            amount,
            bankaccountid
        });

        return await this.ussdService.handleAirtimePurchase(
            customer, merchantid, accountid, amount, bankaccountid, pin, msisdn, session, shortcode
        );
    }

    async getTransactionCharges(customer, msisdn, session, shortcode, merchantid, amount) {
        try {
            const response = await this.ussdService.getAirtimeCharges(customer, merchantid, amount, msisdn, session, shortcode);

            if (response.STATUS === '000' || response.STATUS === 'OK') {
                const charge = this.ussdService.parseAirtimeCharges(response);
                return `Charge: Ksh ${charge}`;
            }
        } catch (error) {
            this.logger.error(`[AIRTIME] Get charges error: ${error.message}`);
        }

        return 'Charge: Ksh 0';
    }

    async clearAirtimeSession(session) {
        try {
            const sessionData = await this.ussdService.getSession(session);
            if (sessionData) {
                delete sessionData.airtime_mode;
                delete sessionData.airtime_method;
                delete sessionData.airtimenetwork;
                delete sessionData.airtimenetworkid;
                delete sessionData.airtimemsisdn;
                delete sessionData.airtimeamount;
                delete sessionData.airtimebankaccount;
                delete sessionData.airtime_beneficiaries; 
                await this.ussdService.saveSession(session, sessionData);
            }
        } catch (error) {
            this.logger.error(`[AIRTIME] Error clearing session: ${error.message}`);
        }
    }

    async handleBackToHome(customer, msisdn, session, shortcode, res) {
        const featureManager = require('./index');
        return await featureManager.execute('navigation', 'mobilebanking', customer, msisdn, session, shortcode, null, res);
    }
}

module.exports = new AirtimeService();