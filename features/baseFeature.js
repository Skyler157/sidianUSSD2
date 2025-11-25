const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class baseFeature {
    constructor() {
        this.menus = require('../config/menus.json');
        this.ussdService = ussdService;
        this.logger = logger;
    }

    // Common response handling
    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');
        const featureName = this.constructor.name.replace('Feature', '').replace('Service', '');
        logger.info(`[${featureName.toUpperCase()}] ${type.toUpperCase()}: ${message}`);
        logger.info(`[${featureName.toUpperCase()}] Message size: ${messageSize} bytes`);

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }

    // Common menu display
    displayMenu(menuKey, res, prefix = '') {
        const menu = this.menus[menuKey];
        if (!menu) {
            logger.error(`Menu not found: ${menuKey}`);
            return this.sendResponse(res, 'end', 'System error. Menu not found.');
        }

        let message = prefix + menu.message;
        if (menu.type === 'menu' && menu.options) {
            message += '\n';
            const desiredOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '0', '00'];
            desiredOrder.forEach(key => {
                if (menu.options[key]) {
                    message += `${key}. ${menu.options[key]}\n`;
                }
            });
            message = message.trim();
        }

        return this.sendResponse(res, menu.type === 'end' ? 'end' : 'con', message);
    }

    async handleBack(sessionData, targetFeature, targetMethod, msisdn, session, shortcode, res) {
        // Use the back navigation mapping from this class
        const backFeature = this.getBackFeature(sessionData.current_menu);
        const backMethod = this.getBackMethod(sessionData.current_menu);

        sessionData.current_menu = backMethod;
        await this.ussdService.saveSession(session, sessionData);

        const featureManager = require('./index');
        return await featureManager.execute(backFeature, backMethod, sessionData.customer, msisdn, session, shortcode, null, res);
    }

    async handleExit(session, res) {
        await this.ussdService.deleteSession(session);
        return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
    }

    // Common menu navigation
    async handleMenuFlow(menuKey, response, menuHandlers, sessionData, msisdn, session, shortcode, res) {
        if (response === '0') {
            return await this.handleBack(sessionData,
                this.getBackFeature(menuKey),
                this.getBackMethod(menuKey),
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (menuHandlers[response]) {
            return await menuHandlers[response]();
        } else {
            return this.displayMenu(menuKey, res, 'Invalid selection. Please try again.\n\n');
        }
    }

    // Common session management
    async updateSessionMenu(session, currentMenu, previousMenu) {
        const sessionData = await this.ussdService.getSession(session);
        sessionData.current_menu = currentMenu;
        sessionData.previous_menu = previousMenu;
        await this.ussdService.saveSession(session, sessionData);
        return sessionData;
    }

    // Common input validation
    validateMobileNumber(mobile) {
        const mobileRegex = /^(254|0)?[17]\d{8}$/;
        return mobileRegex.test(this.formatMobileNumber(mobile));
    }

    formatMobileNumber(mobile) {
        let formatted = mobile.toString().trim();

        if (formatted.startsWith('0')) {
            formatted = '254' + formatted.substring(1);
        } else if (!formatted.startsWith('254')) {
            formatted = '254' + formatted;
        }

        return formatted;
    }

    formatDisplayMobile(mobile) {
        if (mobile.startsWith('254')) {
            return '0' + mobile.substring(3);
        }
        return mobile;
    }

    validateAmount(amount) {
        const num = parseFloat(amount);
        return !isNaN(num) && num > 0;
    }

    validatePin(pin) {
        return /^\d{4}$/.test(pin);
    }

    // Account selection helper
    async showAccountSelection(sessionData, session, res, nextMenu, messagePrefix = 'Select account:') {
        const accounts = sessionData.customer.accounts || [];

        if (accounts.length === 0) {
            return this.sendResponse(res, 'end', 'No accounts found.');
        }

        let accountList = '';
        accounts.forEach((account, index) => {
            accountList += `${index + 1}. ${account}\n`;
        });

        sessionData.current_menu = nextMenu;
        await this.ussdService.saveSession(session, sessionData);

        const message = `${messagePrefix}\n${accountList}\n0. Back\n00. Exit`;
        return this.sendResponse(res, 'con', message);
    }

    // PIN verification helper
    async verifyPIN(customer, pin, msisdn, session, shortcode) {
        try {
            const verifiedCustomer = await this.ussdService.handleLogin(customer, pin, msisdn, session, shortcode);
            return !!verifiedCustomer;
        } catch (error) {
            this.logger.error(`PIN Verification Error: ${error.message}`);
            return false;
        }
    }

    // Navigation mapping
    getBackFeature(menuKey) {
        const backMap = {
            'myaccount': 'navigation',
            'balance': 'accountServices',
            'ministatement': 'accountServices',
            'fullstatement': 'accountServices',
            'beneficiary': 'accountServices',
            'managewithdrawbeneficiary': 'beneficiaryService',
            'addwithdrawbeneficiary': 'beneficiaryService',
            'addwithdrawbeneficiaryname': 'beneficiaryService',
            'addwithdrawbeneficiaryconfirm': 'beneficiaryService',
            'viewwithdrawbeneficiaries': 'beneficiaryService',
            'deletewithdrawbeneficiary': 'beneficiaryService',
            'deletebeneficiaryconfirm': 'beneficiaryService',

            // Mobile Money back navigation
            'mobilemoney': 'navigation',
            'withdraw': 'mobileMoney',
            'withdrawmsisdn': 'withdraw',
            'withdrawamount': 'withdraw',
            'withdrawbankaccount': 'withdrawamount',
            'withdrawtransaction': 'withdrawbankaccount',
            'deposit': 'mobileMoney',
            'depositbankaccount': 'mobileMoney',
            'deposittransaction': 'mobileMoney',

            'buyfloat': 'mobilemoney',
            'buyfloatstore': 'buyfloat',
            'buyfloatamount': 'buyfloatstore',
            'buyfloatbankaccount': 'buyfloatamount',
            'buyfloatremark': 'buyfloatbankaccount',
            'buyfloattransaction': 'buyfloatremark',

            // Buy Goods back navigation
            'buygoods': 'mobilemoney',
            'buygoodsconfirm': 'buygoods',
            'buygoodsamount': 'buygoodsconfirm',
            'buygoodsbankaccount': 'buygoodsamount',
            'buygoodsremark': 'buygoodsbankaccount',
            'buygoodstransaction': 'buygoodsremark',

            // Paybill back navigation
            'paybill': 'mobilemoney',
            'paybillaccount': 'paybill',
            'paybillconfirm': 'paybillaccount',
            'paybillamount': 'paybillconfirm',
            'paybillbankaccount': 'paybillamount',
            'paybillremark': 'paybillbankaccount',
            'paybilltransaction': 'paybillremark',

            'airtime': 'navigation',
            'airtimenetwork': 'airtime',
            'airtimebeneficiary': 'airtimenetwork',
            'airtimemsisdn': 'airtimenetwork',
            'airtimeamount': 'airtimebeneficiary',
            'airtimebankaccount': 'airtimeamount',
            'airtimetransaction': 'airtimebankaccount',

            'changepin': 'navigation',
            'default': 'navigation'
        };
        return backMap[menuKey] || backMap.default;
    }

    getBackMethod(menuKey) {
        const backMap = {
            'myaccount': 'mobilebanking',
            'balance': 'myaccount',
            'ministatement': 'myaccount',
            'fullstatement': 'myaccount',
            'beneficiary': 'myaccount',
            'managewithdrawbeneficiary': 'beneficiary',
            'addwithdrawbeneficiary': 'managewithdrawbeneficiary',
            'addwithdrawbeneficiaryname': 'addwithdrawbeneficiary',
            'addwithdrawbeneficiaryconfirm': 'addwithdrawbeneficiaryname',
            'viewwithdrawbeneficiaries': 'managewithdrawbeneficiary',
            'deletewithdrawbeneficiary': 'managewithdrawbeneficiary',
            'deletebeneficiaryconfirm': 'deletewithdrawbeneficiary',
            'mobilemoney': 'mobilebanking',
            'withdraw': 'mobilemoney',
            'withdrawmsisdn': 'withdraw',
            'withdrawamount': 'withdrawmsisdn',
            'withdrawbankaccount': 'withdrawamount',
            'withdrawtransaction': 'withdrawbankaccount',
            'deposit': 'mobilemoney',
            'depositbankaccount': 'deposit',
            'deposittransaction': 'depositbankaccount',
            'buyfloat': 'mobileMoney',
            'buyfloatstore': 'buyFloat',
            'buyfloatamount': 'buyFloat',
            'buyfloatbankaccount': 'buyFloat',
            'buyfloatremark': 'buyFloat',
            'buyfloattransaction': 'buyFloat',

            // Buy Goods back navigation
            'buygoods': 'mobilemoney',
            'buygoodsconfirm': 'buygoods',
            'buygoodsamount': 'buygoodsconfirm',
            'buygoodsbankaccount': 'buygoodsamount',
            'buygoodsremark': 'buygoodsbankaccount',
            'buygoodstransaction': 'buygoodsremark',

            // Paybill back navigation
            'paybill': 'mobilemoney',
            'paybillaccount': 'paybill',
            'paybillconfirm': 'paybillaccount',
            'paybillamount': 'paybillconfirm',
            'paybillbankaccount': 'paybillamount',
            'paybillremark': 'paybillbankaccount',
            'paybilltransaction': 'paybillremark',

            // Airtime back navigation
            'airtime': 'mobilebanking',
            'airtimenetwork': 'airtime',
            'airtimebeneficiary': 'airtimenetwork',
            'airtimemsisdn': 'airtimenetwork',
            'airtimeamount': 'airtimebeneficiary',
            'airtimebankaccount': 'airtimeamount',
            'airtimetransaction': 'airtimebankaccount',

            'changepin': 'mobilebanking',
            'default': 'mobilebanking'
        };
        return backMap[menuKey] || backMap.default;
    }
}

module.exports = baseFeature;