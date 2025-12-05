const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class baseFeature {
    constructor() {
        this.menus = require('../config/menus.json');
        this.ussdService = ussdService;
        this.logger = logger;
    }

    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');

        // For responses, don't log as menu unless it's actually a menu
        if (message && message.includes('1.') && message.includes('2.')) {
            // It looks like a menu, use 'menu' as the name
            logger.menuDisplay('menu', type, message, messageSize);
        } else {
            // Regular response
            logger.info(`${type.toUpperCase()}: ${message}`);
            logger.info(`MESSAGE SIZE: ${messageSize} bytes`);
        }

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }

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
                    if (key === '0') {
                        message += '\n';
                    }
                    message += `${key}. ${menu.options[key]}\n`;
                }
            });
            message = message.trim();
        }

        const messageSize = Buffer.byteLength(message, 'utf8');
        const type = menu.type === 'end' ? 'end' : 'con';

        // Use the new menu logging format
        logger.menuDisplay(menuKey, type, message, messageSize);

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }

    async handleBack(sessionData, targetFeature, targetMethod, msisdn, session, shortcode, res) {

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


    async updateSessionMenu(session, currentMenu, previousMenu) {
        const sessionData = await this.ussdService.getSession(session);
        if (!sessionData) {
            this.logger.error(`[SESSION] No session data found for session: ${session}`);
            return null;
        }

        sessionData.current_menu = currentMenu;
        sessionData.previous_menu = previousMenu;
        await this.ussdService.saveSession(session, sessionData);

        const verifySession = await this.ussdService.getSession(session);
        return sessionData;
    }


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

    async verifyPIN(customer, pin, msisdn, session, shortcode) {
        try {
            const verifiedCustomer = await this.ussdService.handleLogin(customer, pin, msisdn, session, shortcode);
            return !!verifiedCustomer;
        } catch (error) {
            this.logger.error(`PIN Verification Error: ${error.message}`);
            return false;
        }
    }

    async handleBackToHome(customer, msisdn, session, shortcode, res) {
        const featureManager = require('./index');
        return await featureManager.execute('navigation', 'mobilebanking', customer, msisdn, session, shortcode, null, res);
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

            // Funds Transfer back navigation
            'fundstransfer': 'navigation',
            'internaltransfer': 'fundsTransfer',
            'internaltransferbankaccount': 'fundsTransfer',
            'internaltransferamount': 'fundsTransfer',
            'internaltransferownaccount': 'fundsTransfer',
            'internaltransferremark': 'fundsTransfer',
            'internaltransfertransaction': 'fundsTransfer',
            'internaltransferotheraccount': 'fundsTransfer',
            'internaltransferbeneficiary': 'fundsTransfer',
            'manageinternaltransferbeneficiary': 'fundsTransfer',
            'cardtransfer': 'fundsTransfer',
            'cardnumber': 'fundsTransfer',
            'cardamount': 'fundsTransfer',
            'cardbankaccount': 'fundsTransfer',
            'cardremark': 'fundsTransfer',
            'cardtransaction': 'fundsTransfer',
            'banktransfer': 'fundsTransfer',
            'bankfilter': 'fundsTransfer',
            'banklist': 'fundsTransfer',
            'bankbranch': 'fundsTransfer',
            'bankbranchlist': 'fundsTransfer',
            'banktrasferaccount': 'fundsTransfer',
            'banktrasfername': 'fundsTransfer',
            'banktrasfermount': 'fundsTransfer',
            'banktrasferbankaccount': 'fundsTransfer',
            'banktrasferremark': 'fundsTransfer',
            'banktrasfertransaction': 'fundsTransfer',

            'billpayment': 'navigation',
            'zuku': 'billPayment',
            'billmeter': 'billPayment',
            'billamount': 'billPayment',
            'billbankaccount': 'billPayment',
            'billtransaction': 'billPayment',

            // Zuku sub-services
            'zukusatellite': 'zuku',
            'zukutrippleplay': 'zuku',
            'zukusatellite_account': 'zukusatellite',
            'zukutrippleplay_account': 'zukutrippleplay',
            'zukusatellite_amount': 'zukusatellite_account',
            'zukutrippleplay_amount': 'zukutrippleplay_account',
            'zukusatellite_account_selection': 'zukusatellite_amount',
            'zukutrippleplay_account_selection': 'zukutrippleplay_amount',
            'zukusatellite_confirm': 'zukusatellite_account_selection',
            'zukutrippleplay_confirm': 'zukutrippleplay_account_selection',

            // DStv
            'dstv_account': 'billPayment',
            'dstv_amount': 'billPayment',
            'dstv_account_selection': 'billPayment',
            'dstv_confirm': 'billPayment',

            // GOtv
            'gotv_account': 'billPayment',
            'gotv_amount': 'gotv_account',
            'gotv_account_selection': 'gotv_amount',
            'gotv_confirm': 'gotv_account_selection',

            // StarTimes
            'startimes_account': 'billPayment',
            'startimes_amount': 'startimes_account',
            'startimes_account_selection': 'startimes_amount',
            'startimes_confirm': 'startimes_account_selection',

            // Nairobi Water
            'nairobiwater_account': 'billPayment',
            'nairobiwater_amount': 'nairobiwater_account',
            'nairobiwater_account_selection': 'nairobiwater_amount',
            'nairobiwater_confirm': 'nairobiwater_account_selection',

            // JTL
            'jtl_account': 'billPayment',
            'jtl_amount': 'jtl_account',
            'jtl_account_selection': 'jtl_amount',
            'jtl_confirm': 'jtl_account_selection',

            'pesalink': 'navigation',
            'pesalinkaccount': 'pesalink',
            'pesalinkaccountbanklist': 'pesalinkaccount',
            'pesalinkaccountid': 'pesalinkaccountbanklist',
            'pesalinkaccountamount': 'pesalinkaccountid',
            'pesalinkaccountbankaccount': 'pesalinkaccountamount',
            'pesalinkaccountremark': 'pesalinkaccountbankaccount',
            'pesalinkaccounttransaction': 'pesalinkaccountremark',

            'pesalinkphone': 'pesalink',
            'pesalinkphonebank': 'pesalinkphone',
            'pesalinkphoneamount': 'pesalinkphonebank',
            'pesalinkphonebankaccount': 'pesalinkphoneamount',
            'pesalinkphoneremark': 'pesalinkphonebankaccount',
            'pesalinkphonetransaction': 'pesalinkphoneremark',

            'pesalinkipsl': 'pesalink',
            'pesalinkipsltransaction': 'pesalinkipsl',


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

            // Mobile Money back navigation
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

            // Funds Transfer back navigation
            'fundstransfer': 'mobilebanking',
            'internaltransfer': 'fundstransfer',
            'internaltransferbankaccount': 'internaltransfer',
            'internaltransferamount': 'internaltransferbankaccount',
            'internaltransferownaccount': 'internaltransferamount',
            'internaltransferremark': 'internaltransferownaccount',
            'internaltransfertransaction': 'internaltransferremark',
            'internaltransferotheraccount': 'internaltransfer',

            'cardtransfer': 'fundstransfer',
            'cardnumber': 'cardtransfer',
            'cardamount': 'cardnumber',
            'cardbankaccount': 'cardamount',
            'cardremark': 'cardbankaccount',
            'cardtransaction': 'cardremark',

            'banktransfer': 'fundstransfer',
            'bankfilter': 'banktransfer',
            'banklist': 'bankfilter',
            'bankbranch': 'banklist',
            'bankbranchlist': 'bankbranch',
            'banktrasferaccount': 'bankbranchlist',
            'banktrasfername': 'banktrasferaccount',
            'banktrasfermount': 'banktrasfername',
            'banktrasferbankaccount': 'banktrasfermount',
            'banktrasferremark': 'banktrasferbankaccount',
            'banktrasfertransaction': 'banktrasferremark',

            // Bill Payment back navigation  
            'billpayment': 'mobilebanking',
            'zuku': 'billpayment',
            'billmeter': 'zuku',
            'billamount': 'billmeter',
            'billbankaccount': 'billamount',
            'billtransaction': 'billbankaccount',

            // Zuku sub-services
            'zukusatellite': 'zuku',
            'zukutrippleplay': 'zuku',
            'zukusatellite_account': 'zukusatellite',
            'zukutrippleplay_account': 'zukutrippleplay',
            'zukusatellite_amount': 'zukusatellite_account',
            'zukutrippleplay_amount': 'zukutrippleplay_account',
            'zukusatellite_account_selection': 'zukusatellite_amount',
            'zukutrippleplay_account_selection': 'zukutrippleplay_amount',
            'zukusatellite_confirm': 'zukusatellite_account_selection',
            'zukutrippleplay_confirm': 'zukutrippleplay_account_selection',

            // DStv
            'dstv_account': 'billpayment',
            'dstv_amount': 'dstv_account',
            'dstv_account_selection': 'dstv_amount',
            'dstv_confirm': 'billPayment',

            // GOtv
            'gotv_account': 'billpayment',
            'gotv_amount': 'gotv_account',
            'gotv_account_selection': 'gotv_amount',
            'gotv_confirm': 'gotv_account_selection',

            // StarTimes
            'startimes_account': 'billpayment',
            'startimes_amount': 'startimes_account',
            'startimes_account_selection': 'startimes_amount',
            'startimes_confirm': 'startimes_account_selection',

            // Nairobi Water
            'nairobiwater_account': 'billpayment',
            'nairobiwater_amount': 'nairobiwater_account',
            'nairobiwater_account_selection': 'nairobiwater_amount',
            'nairobiwater_confirm': 'nairobiwater_account_selection',

            // JTL
            'jtl_account': 'billpayment',
            'jtl_amount': 'jtl_account',
            'jtl_account_selection': 'jtl_amount',
            'jtl_confirm': 'jtl_account_selection',

            'pesalink': 'mobilebanking',
            'pesalinkaccount': 'pesalink',
            'pesalinkaccountbanklist': 'pesalinkaccount',
            'pesalinkaccountid': 'pesalinkaccountbanklist',
            'pesalinkaccountamount': 'pesalinkaccountid',
            'pesalinkaccountbankaccount': 'pesalinkaccountamount',
            'pesalinkaccountremark': 'pesalinkaccountbankaccount',
            'pesalinkaccounttransaction': 'pesalinkaccountremark',

            'pesalinkphone': 'pesalink',
            'pesalinkphonebank': 'pesalinkphone',
            'pesalinkphoneamount': 'pesalinkphonebank',
            'pesalinkphonebankaccount': 'pesalinkphoneamount',
            'pesalinkphoneremark': 'pesalinkphonebankaccount',
            'pesalinkphonetransaction': 'pesalinkphoneremark',

            'pesalinkipsl': 'pesalink',
            'pesalinkipsltransaction': 'pesalinkipsl',


            'changepin': 'mobilebanking',
            'default': 'mobilebanking'
        };
        return backMap[menuKey] || backMap.default;
    }
}

module.exports = baseFeature;
