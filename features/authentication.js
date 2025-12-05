const baseFeature = require('./baseFeature');

class AuthenticationFeature extends baseFeature {
    constructor() {
        super();
    }

    async home(customer, msisdn, session, shortcode, response, res) {

        if (!customer) {
            customer = await this.ussdService.handleCustomerLookup(msisdn, session, shortcode);
            if (!customer) {
                return this.sendResponse(res, 'end', 'Unable to retrieve customer information.');
            }
        }

        if (!response) {
            const sessionData = { customer, current_menu: 'home', previous_menu: 'home' };
            await this.ussdService.saveSession(session, sessionData);

            const message = this.menus.home.message.replace('{firstname}', customer.firstname);
            return this.sendResponse(res, 'con', message);
        }

        if (response === '1') {
            return this.sendResponse(res, 'end', 'Please visit your nearest branch to reset your PIN.');
        }

        const loggedInCustomer = await this.ussdService.handleLogin(customer, response, msisdn, session, shortcode);

        if (loggedInCustomer) {
            loggedInCustomer.loggedIn = true;
            const sessionData = {
                customer: loggedInCustomer,
                current_menu: 'mobilebanking',
                previous_menu: 'home'
            };
            await this.ussdService.saveSession(session, sessionData);

            const featureManager = require('./index');
            return await featureManager.execute('navigation', 'mobilebanking', loggedInCustomer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter your PIN:');
        }
    }
}

module.exports = new AuthenticationFeature();