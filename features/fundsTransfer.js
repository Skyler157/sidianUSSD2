const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class FundsTransferFeature {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async fundstransfer(customer, msisdn, session, shortcode, response, res) {
        logger.info(`FundsTransfer::fundstransfer: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'fundstransfer';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('fundstransfer', res);
        }

        const menuHandlers = {
            '1': () => this.transferown(customer, msisdn, session, shortcode, null, res),
            '2': () => this.transferother(customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'fundstransfer');
    }

    async transferown(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'transferown';
            sessionData.previous_menu = 'fundstransfer';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('transferown', res);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            const toAccount = accounts[selectedIndex];
            sessionData.to_account = toAccount;
            sessionData.current_menu = 'transferown_amount';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('transferown_amount', res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    async transferown_amount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            return this.displayMenu('transferown_amount', res);
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
        sessionData.current_menu = 'transferown_source';
        await ussdService.saveSession(session, sessionData);

        return await this.showAccountSelection(sessionData, session, res, 'transferown_source');
    }

    async transferother(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'transferother';
            sessionData.previous_menu = 'fundstransfer';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('transferother', res);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate account number (basic check)
        if (!response || response.length < 5) {
            return this.sendResponse(res, 'con', 'Invalid account number. Please enter a valid account:\n\n0. Back\n00. Home');
        }

        sessionData.to_account = response;
        sessionData.current_menu = 'transferother_amount';
        await ussdService.saveSession(session, sessionData);

        return this.displayMenu('transferother_amount', res);
    }

    // Helper methods
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
        logger.info(`FUNDS_TRANSFER_MENU{${type}}: ${message}`);
        logger.info(`FUNDS_TRANSFER_MENU SIZE: ${messageSize} bytes`);
        
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new FundsTransferFeature();