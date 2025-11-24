const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class AccountServicesFeature {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async myaccount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[ACCOUNT] myaccount: ${msisdn}, session: ${session}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'myaccount';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('myaccount', res);
        }

        const featureManager = require('./index');
        const menuHandlers = {
            '1': () => featureManager.execute('balanceService', 'balance', customer, msisdn, session, shortcode, null, res),
            '2': () => featureManager.execute('statementService', 'ministatement', customer, msisdn, session, shortcode, null, res),
            '3': () => featureManager.execute('statementService', 'fullstatement', customer, msisdn, session, shortcode, null, res),
            '4': () => featureManager.execute('beneficiaryService', 'beneficiary', customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleBack(sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleExit(session, res)
        };

        if (menuHandlers[response]) {
            return await menuHandlers[response]();
        } else {
            return this.displayMenu('myaccount', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async handleBack(sessionData, msisdn, session, shortcode, res) {
        sessionData.current_menu = 'mobilebanking';
        await ussdService.saveSession(session, sessionData);
        
        const featureManager = require('./index');
        return await featureManager.execute('navigation', 'mobilebanking', sessionData.customer, msisdn, session, shortcode, null, res);
    }

    async handleExit(session, res) {
        await ussdService.deleteSession(session);
        return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
    }

    displayMenu(menuKey, res, prefix = '') {
        const menu = this.menus[menuKey];
        if (!menu) {
            return this.sendResponse(res, 'end', 'System error. Menu not found.');
        }

        let message = prefix + menu.message;
        if (menu.type === 'menu' && menu.options) {
            message += '\n';
            const optionsOrder = ['1', '2', '3', '0', '00'];
            optionsOrder.forEach(key => {
                if (menu.options[key]) {
                    message += `${key}. ${menu.options[key]}\n`;
                }
            });
            message = message.trim();
        }

        return this.sendResponse(res, 'con', message);
    }

    sendResponse(res, type, message) {
        logger.info(`[ACCOUNT] ${type.toUpperCase()}: ${message}`);
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new AccountServicesFeature();