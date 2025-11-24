const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class AuthenticationFeature {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async home(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[AUTH] home: ${msisdn}, session: ${session}`);

        if (!customer) {
            customer = await ussdService.handleCustomerLookup(msisdn, session, shortcode);
            if (!customer) {
                return this.sendResponse(res, 'end', 'Unable to retrieve customer information.');
            }
        }

        if (!response) {
            const sessionData = { customer, current_menu: 'home', previous_menu: 'home' };
            await ussdService.saveSession(session, sessionData);
            
            const message = this.menus.home.message.replace('{firstname}', customer.firstname);
            return this.sendResponse(res, 'con', message);
        }

        if (response === '1') {
            return this.sendResponse(res, 'end', 'Please visit your nearest branch to reset your PIN.');
        }

        const loggedInCustomer = await ussdService.handleLogin(customer, response, msisdn, session, shortcode);

        if (loggedInCustomer) {
            loggedInCustomer.loggedIn = true;
            const sessionData = { 
                customer: loggedInCustomer, 
                current_menu: 'mobilebanking', 
                previous_menu: 'home' 
            };
            await ussdService.saveSession(session, sessionData);
            
            // ROUTE TO NAVIGATION FEATURE INSTEAD OF DIRECTLY SHOWING MENU
            const featureManager = require('./index');
            return await featureManager.execute('navigation', 'mobilebanking', loggedInCustomer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter your PIN:');
        }
    }

    sendResponse(res, type, message) {
        logger.info(`[AUTH] ${type.toUpperCase()}: ${message}`);
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new AuthenticationFeature();