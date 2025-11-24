const logger = require('../services/logger');

delete require.cache[__filename];

class NavigationFeature {
    constructor() {
        // Clear and reload menus
        delete require.cache[require.resolve('../config/menus.json')];
        this.menus = require('../config/menus.json');
        logger.info(`[NAV] Menus loaded - mobilebanking options: ${JSON.stringify(this.menus.mobilebanking.options)}`);
    }

    async mobilebanking(customer, msisdn, session, shortcode, response, res) {
        const ussdService = require('../services/ussdService');
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // Initial menu display
            sessionData.current_menu = 'mobilebanking';
            sessionData.previous_menu = 'home';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('mobilebanking', res);
        }

        // Handle menu selection with the new logic
        return await this.handleMenuSelection('mobilebanking', response, customer, msisdn, session, shortcode, res);
    }

    async handleMenuSelection(menuKey, userInput, customer, msisdn, session, shortcode, res) {
        const menu = this.menus[menuKey];
        const options = menu.options;
        const ussdService = require('../services/ussdService');
        const featureManager = require('./index');

        // Handle exit first
        if (userInput === '00') {
            await ussdService.deleteSession(session);
            return this.sendResponse(res, 'end', 'Thank you for banking with Sidian Bank. Goodbye!');
        }

        // Handle back
        if (userInput === '0') {
            const sessionData = await ussdService.getSession(session);
            const previousMenu = sessionData.previous_menu || 'home';

            // Clear current session data for back navigation
            delete sessionData.current_menu;
            delete sessionData.previous_menu;
            await ussdService.saveSession(session, sessionData);

            // Route back to previous menu using the controller's routing
            const ussdController = require('../controllers/ussdController');
            return await ussdController.routeToFeature(previousMenu, customer, msisdn, session, shortcode, null, res);
        }

        // Handle other menu options
        const menuHandlers = {
            '1': () => featureManager.execute('accountServices', 'myaccount', customer, msisdn, session, shortcode, null, res),
            '2': () => featureManager.execute('mobileMoney', 'mobilemoney', customer, msisdn, session, shortcode, null, res),
            '3': () => featureManager.execute('airtime', 'airtime', customer, msisdn, session, shortcode, null, res),
            '4': () => featureManager.execute('fundsTransfer', 'fundstransfer', customer, msisdn, session, shortcode, null, res),
            '5': () => featureManager.execute('billPayment', 'billpayment', customer, msisdn, session, shortcode, null, res),
            '6': () => featureManager.execute('merchantPayment', 'paymerchant', customer, msisdn, session, shortcode, null, res),
            '7': () => featureManager.execute('pinManagement', 'changepin', customer, msisdn, session, shortcode, null, res),
            '8': () => featureManager.execute('termDeposits', 'termdeposits', customer, msisdn, session, shortcode, null, res)
        };

        if (menuHandlers[userInput]) {
            // Update session with current menu as previous menu for back navigation
            const sessionData = await ussdService.getSession(session);
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);

            return await menuHandlers[userInput]();
        }

        // Invalid selection
        return this.displayMenu(menuKey, res, 'Invalid selection. Please try again.\n\n');
    }

    displayMenu(menuKey, res, prefix = '') {
        const menu = this.menus[menuKey];
        if (!menu) {
            return this.sendResponse(res, 'end', 'System error. Menu not found.');
        }

        let message = prefix + this.formatMenu(menu);
        return this.sendResponse(res, 'con', message);
    }

    formatMenu(menu) {
        let menuText = menu.message + '\n';
        const options = menu.options;

        // Add numbered options first (excluding 0 and 00)
        for (const [key, value] of Object.entries(options)) {
            if (key !== '0' && key !== '00') {
                menuText += `${key}. ${value}\n`;
            }
        }

        // Add Back and Exit at the bottom
        if (options['0']) menuText += `0. ${options['0']}\n`;
        if (options['00']) menuText += `00. ${options['00']}\n`;

        return menuText.trim();
    }

    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');
        logger.info(`[NAV] ${type.toUpperCase()}: ${message}`);
        logger.info(`[NAV] Message size: ${messageSize} bytes`);

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new NavigationFeature();