const baseFeature = require('./baseFeature');

class NavigationFeature extends baseFeature {
    constructor() {
        super();
    }

    async mobilebanking(customer, msisdn, session, shortcode, response, res) {
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
            '8': () => featureManager.execute('termDeposits', 'termdeposits', customer, msisdn, session, shortcode, null, res)
        };

        return await this.handleMenuFlow('mobilebanking', userInput, menuHandlers, sessionData, msisdn, session, shortcode, res);
    }
}

module.exports = new NavigationFeature();