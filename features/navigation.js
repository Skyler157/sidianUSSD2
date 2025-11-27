const baseFeature = require('./baseFeature');
const logger = require('../services/logger');

class NavigationFeature extends baseFeature {
    constructor() {
        super();
    }

    async mobilebanking(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[NAVIGATION] mobilebanking: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);
        
        const sessionData = await this.ussdService.getSession(session);
        
        if (!response) {
            await this.updateSessionMenu(session, 'mobilebanking', 'home');
            return this.displayMenu('mobilebanking', res);
        }

        return await this.handleMenuSelection(response, customer, msisdn, session, shortcode, res);
    }

    async handleMenuSelection(userInput, customer, msisdn, session, shortcode, res) {
        const sessionData = await this.ussdService.getSession(session);
        
        const featureManager = require('./index');
        const menuHandlers = {
            '1': () => featureManager.execute('accountServices', 'myaccount', customer, msisdn, session, shortcode, null, res),
            '2': () => featureManager.execute('mobileMoney', 'mobilemoney', customer, msisdn, session, shortcode, null, res),
            '3': () => featureManager.execute('airtime', 'airtime', customer, msisdn, session, shortcode, null, res),
            '4': () => featureManager.execute('fundsTransfer', 'fundstransfer', customer, msisdn, session, shortcode, null, res),
            '5': () => featureManager.execute('billPayment', 'billpayment', customer, msisdn, session, shortcode, null, res),
            '6': () => featureManager.execute('merchantPayment', 'paymerchant', customer, msisdn, session, shortcode, null, res),
            '7': () => featureManager.execute('pinManagement', 'changepin', customer, msisdn, session, shortcode, null, res),
            '8': () => featureManager.execute('termDeposits', 'termdeposits', customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleBack(sessionData, 'authentication', 'home', msisdn, session, shortcode, res), 
            '00': () => this.handleExit(session, res) 
        };

        return await this.handleMenuFlow('mobilebanking', userInput, menuHandlers, sessionData, msisdn, session, shortcode, res);
    }
}

module.exports = new NavigationFeature();