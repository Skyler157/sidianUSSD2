const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class PinManagementFeature {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async changepin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`PinManagement::changepin: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'changepin';
            sessionData.previous_menu = 'mobilebanking';
            sessionData.pin_stage = 'enter_old_pin';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('changepin', res);
        }

        switch (sessionData.pin_stage) {
            case 'enter_old_pin':
                return await this.handleOldPin(customer, msisdn, session, shortcode, response, res, sessionData);
            
            case 'enter_new_pin':
                return await this.handleNewPin(customer, msisdn, session, shortcode, response, res, sessionData);
            
            case 'reenter_new_pin':
                return await this.handleConfirmPin(customer, msisdn, session, shortcode, response, res, sessionData);
            
            default:
                return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }
    }

    async handleOldPin(customer, msisdn, session, shortcode, response, res, sessionData) {
        if (response === '0') {
            return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        }

        // Validate PIN format
        if (!this.isValidPin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN format. PIN must be 4 digits:\n\n0. Back\n00. Home');
        }

        // Verify old PIN
        const pinVerified = await this.verifyPIN(customer, response, msisdn, session, shortcode);
        if (!pinVerified) {
            return this.sendResponse(res, 'con', 'Invalid current PIN. Please try again:\n\n0. Back\n00. Home');
        }

        sessionData.old_pin = response;
        sessionData.pin_stage = 'enter_new_pin';
        await ussdService.saveSession(session, sessionData);
        return this.displayMenu('changepin_new', res);
    }

    async handleNewPin(customer, msisdn, session, shortcode, response, res, sessionData) {
        if (response === '0') {
            sessionData.pin_stage = 'enter_old_pin';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('changepin', res);
        }

        if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        }

        // Validate PIN format
        if (!this.isValidPin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN format. PIN must be 4 digits:\n\n0. Back\n00. Home');
        }

        // Check if new PIN is same as old PIN
        if (response === sessionData.old_pin) {
            return this.sendResponse(res, 'con', 'New PIN cannot be the same as old PIN:\n\n0. Back\n00. Home');
        }

        sessionData.new_pin = response;
        sessionData.pin_stage = 'reenter_new_pin';
        await ussdService.saveSession(session, sessionData);
        return this.displayMenu('changepin_confirm', res);
    }

    async handleConfirmPin(customer, msisdn, session, shortcode, response, res, sessionData) {
        if (response === '0') {
            sessionData.pin_stage = 'enter_new_pin';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('changepin_new', res);
        }

        if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        }

        // Validate PIN format
        if (!this.isValidPin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN format. PIN must be 4 digits:\n\n0. Back\n00. Home');
        }

        // Check if PINs match
        if (response !== sessionData.new_pin) {
            return this.sendResponse(res, 'con', 'PINs do not match. Please try again:\n\n0. Back\n00. Home');
        }

        // Process PIN change
        try {
            const pinChangeResult = await ussdService.handlePinChange(
                customer,
                sessionData.old_pin,
                response, // new PIN
                msisdn,
                session,
                shortcode
            );

            if (pinChangeResult.STATUS === '000') {
                await ussdService.deleteSession(session);
                return this.displayMenu('changepin_success', res);
            } else {
                const errorMsg = pinChangeResult.DATA || 'PIN change failed';
                return this.sendResponse(res, 'end', `PIN change failed: ${errorMsg}`);
            }
        } catch (error) {
            logger.error(`PIN Change Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'PIN change failed. Please try again later.');
        }
    }

    // Helper methods
    isValidPin(pin) {
        return /^\d{4}$/.test(pin);
    }

    async verifyPIN(customer, pin, msisdn, session, shortcode) {
        try {
            const verifiedCustomer = await ussdService.handleLogin(customer, pin, msisdn, session, shortcode);
            return !!verifiedCustomer;
        } catch (error) {
            logger.error(`PIN Verification Error: ${error.message}`);
            return false;
        }
    }

    displayMenu(menuKey, res, prefix = '') {
        const menu = this.menus[menuKey];
        if (!menu) {
            logger.error(`Menu not found: ${menuKey}`);
            return this.sendResponse(res, 'end', 'System error. Menu not found.');
        }

        let message = prefix + menu.message;
        return this.sendResponse(res, menu.type === 'end' ? 'end' : 'con', message);
    }

    async handleNavigation(response, sessionData, msisdn, session, shortcode, res) {
        if (response === '0') {
            const previousMenu = sessionData.previous_menu || 'mobilebanking';
            sessionData.current_menu = previousMenu;
            await ussdService.saveSession(session, sessionData);
            return this.sendResponse(res, 'con', 'Navigation to previous menu');
        } else if (response === '00') {
            await ussdService.deleteSession(session);
            return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
        }
        return this.sendResponse(res, 'con', 'Invalid navigation.');
    }

    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');
        logger.info(`PIN_MANAGEMENT{${type}}: ${message}`);
        logger.info(`PIN_MANAGEMENT SIZE: ${messageSize} bytes`);
        
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new PinManagementFeature();