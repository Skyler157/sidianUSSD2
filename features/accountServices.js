const baseFeature = require('./baseFeature');

class AccountServicesFeature extends baseFeature {
    constructor() {
        super();
    }

    async myaccount(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[ACCOUNT] myaccount: ${msisdn}, session: ${session}`);

        if (!response) {
            await this.updateSessionMenu(session, 'myaccount', 'mobilebanking');
            return this.displayMenu('myaccount', res);
        }

        const featureManager = require('./index');
        const menuHandlers = {
            '1': () => featureManager.execute('balanceService', 'balance', customer, msisdn, session, shortcode, null, res),
            '2': () => featureManager.execute('statementService', 'ministatement', customer, msisdn, session, shortcode, null, res),
            '3': () => featureManager.execute('statementService', 'fullstatement', customer, msisdn, session, shortcode, null, res),
            '4': () => featureManager.execute('beneficiaryService', 'beneficiary', customer, msisdn, session, shortcode, null, res)
        };

        return await this.handleMenuFlow('myaccount', response, menuHandlers,
            await this.ussdService.getSession(session), msisdn, session, shortcode, res);
    }
}

module.exports = new AccountServicesFeature();