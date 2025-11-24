const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class AirtimeFeature {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async airtime(customer, msisdn, session, shortcode, response, res) {
        logger.info(`Airtime::airtime: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'airtime';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('airtime', res);
        }

        const menuHandlers = {
            '1': () => this.buyownairtime(customer, msisdn, session, shortcode, null, res),
            '2': () => this.buyotherairtime(customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'airtime');
    }

    async buyownairtime(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'buyownairtime';
            sessionData.previous_menu = 'airtime';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('buyownairtime', res);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate amount
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Home');
        }

        sessionData.amount = amount;
        sessionData.mobile_number = msisdn; // Own number
        sessionData.current_menu = 'buyownairtime_account';
        await ussdService.saveSession(session, sessionData);

        return await this.showAccountSelection(sessionData, session, res, 'buyownairtime_account');
    }

    async buyotherairtime(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'buyotherairtime';
            sessionData.previous_menu = 'airtime';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('buyotherairtime', res);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate mobile number
        if (!this.validateMobileNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid 07XXX or 01XXX number:\n\n0. Back\n00. Home');
        }

        sessionData.recipient_mobile = this.formatMobileNumber(response);
        sessionData.current_menu = 'buyotherairtime_amount';
        await ussdService.saveSession(session, sessionData);

        return this.displayMenu('buyotherairtime_amount', res);
    }

    async buyotherairtime_amount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            return this.displayMenu('buyotherairtime_amount', res);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate amount
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Home');
        }

        sessionData.amount = amount;
        sessionData.current_menu = 'buyotherairtime_account';
        await ussdService.saveSession(session, sessionData);

        return await this.showAccountSelection(sessionData, session, res, 'buyotherairtime_account');
    }

    async buyownairtime_account(customer, msisdn, session, shortcode, response, res) {
        return await this.handleAirtimeAccountSelection(customer, msisdn, session, shortcode, response, res, 'own');
    }

    async buyotherairtime_account(customer, msisdn, session, shortcode, response, res) {
        return await this.handleAirtimeAccountSelection(customer, msisdn, session, shortcode, response, res, 'other');
    }

    async handleAirtimeAccountSelection(customer, msisdn, session, shortcode, response, res, type) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            return await this.showAccountSelection(sessionData, session, res, 
                type === 'own' ? 'buyownairtime_account' : 'buyotherairtime_account');
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            const selectedAccount = accounts[selectedIndex];
            sessionData.selected_account = selectedAccount;
            sessionData.current_menu = type === 'own' ? 'buyownairtime_confirm' : 'buyotherairtime_confirm';
            await ussdService.saveSession(session, sessionData);

            const mobile = type === 'own' ? 
                this.formatDisplayMobile(sessionData.mobile_number) : 
                this.formatDisplayMobile(sessionData.recipient_mobile);

            const message = `Confirm buying Ksh ${sessionData.amount} airtime for ${mobile} from account ${selectedAccount}\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    // Helper methods
    validateMobileNumber(mobile) {
        const mobileRegex = /^(07[0-9]{8}|01[0-9]{8}|2547[0-9]{8}|2541[0-9]{8})$/;
        return mobileRegex.test(mobile);
    }

    formatMobileNumber(mobile) {
        if (mobile.startsWith('0')) {
            return '254' + mobile.substring(1);
        }
        return mobile;
    }

    formatDisplayMobile(mobile) {
        if (mobile.startsWith('254')) {
            return '0' + mobile.substring(3);
        }
        return mobile;
    }

    async showAccountSelection(sessionData, session, res, nextMenu) {
        const accounts = sessionData.customer.accounts || [];
        let accountList = '';

        accounts.forEach((account, index) => {
            accountList += `${index + 1}. ${account}\n`;
        });

        sessionData.current_menu = nextMenu;
        await ussdService.saveSession(session, sessionData);

        const message = `Select account:\n${accountList}\n0. Back\n00. Home`;
        return this.sendResponse(res, 'con', message);
    }

    async handleMenuNavigation(response, handlers, sessionData, msisdn, session, shortcode, res, menuName) {
        if (handlers[response]) {
            return await handlers[response]();
        } else {
            return this.displayMenu(menuName, res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async handleNavigation(response, sessionData, msisdn, session, shortcode, res) {
        // Navigation logic - would be in shared utility
        return this.sendResponse(res, 'con', 'Navigation not implemented yet');
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
            const desiredOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00'];
            desiredOrder.forEach(key => {
                if (menu.options[key]) {
                    message += `${key}. ${menu.options[key]}\n`;
                }
            });
            message = message.trim();
        }

        return this.sendResponse(res, menu.type === 'end' ? 'end' : 'con', message);
    }

    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');
        logger.info(`AIRTIME_MENU{${type}}: ${message}`);
        logger.info(`AIRTIME_MENU SIZE: ${messageSize} bytes`);
        
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new AirtimeFeature();