const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class BillPaymentFeature {
    constructor() {
        this.menus = require('../config/menus.json');
        this.billProviders = {
            '1': { name: 'DStv', code: 'DSTV' },
            '2': { name: 'GOtv', code: 'GOTV' },
            '3': { name: 'Zuku', code: 'ZUKU' },
            '4': { name: 'StarTimes', code: 'STARTIMES' },
            '5': { name: 'Nairobi Water', code: 'NAIROBIWATER' },
            '6': { name: 'JTL', code: 'JTL' }
        };
    }

    async billpayment(customer, msisdn, session, shortcode, response, res) {
        logger.info(`BillPayment::billpayment: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'billpayment';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('billpayment', res);
        }

        const menuHandlers = {
            '1': () => this.processBillPayment(customer, msisdn, session, shortcode, '1', res),
            '2': () => this.processBillPayment(customer, msisdn, session, shortcode, '2', res),
            '3': () => this.zuku(customer, msisdn, session, shortcode, null, res),
            '4': () => this.processBillPayment(customer, msisdn, session, shortcode, '4', res),
            '5': () => this.processBillPayment(customer, msisdn, session, shortcode, '5', res),
            '6': () => this.processBillPayment(customer, msisdn, session, shortcode, '6', res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'billpayment');
    }

    async processBillPayment(customer, msisdn, session, shortcode, billType, res) {
        const sessionData = await ussdService.getSession(session);
        const provider = this.billProviders[billType];

        if (!provider) {
            return this.sendResponse(res, 'con', 'Invalid bill provider. Please try again:\n\n0. Back\n00. Home');
        }

        sessionData.bill_type = billType;
        sessionData.bill_name = provider.name;
        sessionData.bill_code = provider.code;
        sessionData.current_menu = `${provider.code.toLowerCase()}_account`;
        await ussdService.saveSession(session, sessionData);

        const message = `Enter ${provider.name} account number:\n\n0. Back\n00. Home`;
        return this.sendResponse(res, 'con', message);
    }

    async zuku(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'zuku';
            sessionData.previous_menu = 'billpayment';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('zuku', res);
        }

        const menuHandlers = {
            '1': () => this.processZukuService(customer, msisdn, session, shortcode, 'satellite', res),
            '2': () => this.processZukuService(customer, msisdn, session, shortcode, 'trippleplay', res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'zuku');
    }

    async processZukuService(customer, msisdn, session, shortcode, serviceType, res) {
        const sessionData = await ussdService.getSession(session);
        
        const serviceName = serviceType === 'satellite' ? 'Zuku Satellite' : 'Zuku Tripple Play';
        sessionData.bill_name = serviceName;
        sessionData.bill_code = 'ZUKU';
        sessionData.zuku_service = serviceType;
        sessionData.current_menu = `zuku${serviceType}_account`;
        await ussdService.saveSession(session, sessionData);

        const message = `Enter ${serviceName} account number:\n\n0. Back\n00. Home`;
        return this.sendResponse(res, 'con', message);
    }

    // Helper methods
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
        logger.info(`BILL_PAYMENT_MENU{${type}}: ${message}`);
        logger.info(`BILL_PAYMENT_MENU SIZE: ${messageSize} bytes`);
        
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new BillPaymentFeature();