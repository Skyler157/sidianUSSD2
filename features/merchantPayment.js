const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class MerchantPaymentFeature {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async paymerchant(customer, msisdn, session, shortcode, response, res) {
        logger.info(`MerchantPayment::paymerchant: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'paymerchant';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('paymerchant', res);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate merchant code
        if (!this.validateMerchantCode(response)) {
            return this.sendResponse(res, 'con', 'Invalid merchant code. Please enter a valid code:\n\n0. Back\n00. Home');
        }

        sessionData.merchant_code = response;
        sessionData.current_menu = 'paymerchant_confirm';
        await ussdService.saveSession(session, sessionData);

        // Get merchant name from code (in real implementation, this would call an API)
        const merchantName = await this.getMerchantName(response);
        const message = this.menus.paymerchant_confirm.message.replace('{merchant_name}', merchantName);
        
        return this.sendResponse(res, 'con', message);
    }

    async paymerchant_confirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const merchantName = await this.getMerchantName(sessionData.merchant_code);
            const message = this.menus.paymerchant_confirm.message.replace('{merchant_name}', merchantName);
            return this.sendResponse(res, 'con', message);
        }

        const menuHandlers = {
            '1': () => this.paymerchant_amount(customer, msisdn, session, shortcode, null, res),
            '2': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'paymerchant_confirm');
    }

    async paymerchant_amount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'paymerchant_amount';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('paymerchant_amount', res);
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
        sessionData.current_menu = 'paymerchant_account';
        await ussdService.saveSession(session, sessionData);

        return await this.showAccountSelection(sessionData, session, res, 'paymerchant_account');
    }

    // Helper methods
    validateMerchantCode(code) {
        // Basic validation - in real implementation, this would validate against a database
        return code && code.length >= 3 && code.length <= 10 && /^[A-Z0-9]+$/i.test(code);
    }

    async getMerchantName(merchantCode) {
        // In real implementation, this would call an API or query a database
        const merchantMap = {
            'M001': 'SuperMart Limited',
            'M002': 'TechStore Kenya', 
            'M003': 'City Restaurant',
            'M004': 'Online Services Ltd',
            'M005': 'Utility Providers Co'
        };
        
        return merchantMap[merchantCode] || `Merchant ${merchantCode}`;
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
        logger.info(`MERCHANT_PAYMENT_MENU{${type}}: ${message}`);
        logger.info(`MERCHANT_PAYMENT_MENU SIZE: ${messageSize} bytes`);
        
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new MerchantPaymentFeature();