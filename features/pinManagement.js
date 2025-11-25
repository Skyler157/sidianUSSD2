const baseFeature = require('./baseFeature');

class PinManagementFeature extends baseFeature {
    constructor() {
        super();
    }

    async changepin(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[PIN] changepin: ${msisdn}, session: ${session}`);

        const sessionData = await this.updateSessionMenu(session, 'changepin', 'mobilebanking');

        if (!response) {
            sessionData.pin_stage = 'enter_old_pin';
            await this.ussdService.saveSession(session, sessionData);
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
                return await this.handleMenuFlow('changepin', response, {}, sessionData, msisdn, session, shortcode, res);
        }
    }

    async handleOldPin(customer, msisdn, session, shortcode, response, res, sessionData) {
        if (response === '0' || response === '00') {
            return await this.handleMenuFlow('changepin', response, {}, sessionData, msisdn, session, shortcode, res);
        }

        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN format. PIN must be 4 digits:\n\n0. Back\n00. Exit');
        }

        if (!await this.verifyPIN(customer, response, msisdn, session, shortcode)) {
            return this.sendResponse(res, 'con', 'Invalid current PIN. Please try again:\n\n0. Back\n00. Exit');
        }

        sessionData.old_pin = response;
        sessionData.pin_stage = 'enter_new_pin';
        await this.ussdService.saveSession(session, sessionData);
        return this.displayMenu('changepin_new', res);
    }

    async handleNewPin(customer, msisdn, session, shortcode, response, res, sessionData) {
        if (response === '0' || response === '00') {
            sessionData.pin_stage = 'enter_old_pin';
            await this.ussdService.saveSession(session, sessionData);
            return this.displayMenu('changepin', res);
        }

        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN format. PIN must be 4 digits:\n\n0. Back\n00. Exit');
        }

        if (response === sessionData.old_pin) {
            return this.sendResponse(res, 'con', 'New PIN cannot be the same as old PIN:\n\n0. Back\n00. Exit');
        }

        sessionData.new_pin = response;
        sessionData.pin_stage = 'reenter_new_pin';
        await this.ussdService.saveSession(session, sessionData);
        return this.displayMenu('changepin_confirm', res);
    }

    async handleConfirmPin(customer, msisdn, session, shortcode, response, res, sessionData) {
        if (response === '0' || response === '00') {
            sessionData.pin_stage = 'enter_new_pin';
            await this.ussdService.saveSession(session, sessionData);
            return this.displayMenu('changepin_new', res);
        }

        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN format. PIN must be 4 digits:\n\n0. Back\n00. Exit');
        }

        if (response !== sessionData.new_pin) {
            return this.sendResponse(res, 'con', 'PINs do not match. Please try again:\n\n0. Back\n00. Exit');
        }

        try {
            const pinChangeResult = await this.ussdService.handlePinChange(
                customer,
                sessionData.old_pin,
                response,
                msisdn,
                session,
                shortcode
            );

            if (pinChangeResult.STATUS === '000') {
                await this.ussdService.deleteSession(session);
                return this.displayMenu('changepin_success', res);
            } else {
                const errorMsg = pinChangeResult.DATA || 'PIN change failed';
                return this.sendResponse(res, 'end', `PIN change failed: ${errorMsg}`);
            }
        } catch (error) {
            this.logger.error(`[PIN] PIN Change Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'PIN change failed. Please try again later.');
        }
    }
}

module.exports = new PinManagementFeature();