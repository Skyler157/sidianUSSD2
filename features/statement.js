const baseFeature = require('./baseFeature');

class StatementService extends baseFeature {
    constructor() {
        super();
    }

    async ministatement(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[STATEMENT] ministatement: ${msisdn}, session: ${session}`);
        const sessionData = await this.updateSessionMenu(session, 'ministatement', 'myaccount');

        if (!response) {
            return this.showAccountSelection(sessionData, session, res, 'ministatement');
        }

        const menuHandlers = {
            '0': () => this.handleBack(sessionData, 'accountServices', 'myaccount', msisdn, session, shortcode, res),
            '00': () => this.handleExit(session, res)
        };

        if (menuHandlers[response]) {
            return await menuHandlers[response]();
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.selected_account = accounts[selectedIndex];
            sessionData.current_menu = 'ministatement_pin';
            await this.ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Enter your PIN to view mini statement:\n\n0. Back\n00. Exit');
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async ministatement_pin(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[STATEMENT] ministatement_pin: ${msisdn}, session: ${session}`);
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            return this.sendResponse(res, 'con', 'Enter your PIN to view mini statement:\n\n0. Back\n00. Exit');
        }

        if (response === '0' || response === '00') {
            return await this.handleMenuFlow('ministatement_pin', response, {}, sessionData, msisdn, session, shortcode, res);
        }

        if (!await this.verifyPIN(customer, response, msisdn, session, shortcode)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please try again:\n\n0. Back\n00. Exit');
        }

        try {
            const { statementResponse } = await this.ussdService.handleMiniStatement(
                customer,
                sessionData.selected_account,
                msisdn,
                session,
                shortcode
            );

            if (statementResponse.STATUS === '000') {
                let statementData = statementResponse.DATA || 'No transactions found';
                
                if (statementData.includes('Mini Statement:')) {
                    statementData = statementData.replace('Mini Statement:', '').trim();
                }

                sessionData.current_menu = 'ministatement_result';
                sessionData.statement_data = statementData;
                await this.ussdService.saveSession(session, sessionData);

                const message = `Account: ${sessionData.selected_account}\nMini Statement:\n${statementData}\n\n0. Back\n00. Exit`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = statementResponse.DATA || 'Unable to fetch mini statement';
                return this.sendResponse(res, 'end', `Sorry, we couldn't retrieve your mini statement. Error: ${errorMsg}`);
            }
        } catch (error) {
            this.logger.error(`[STATEMENT] Mini Statement Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    async ministatement_result(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            const message = `Account: ${sessionData.selected_account}\nMini Statement:\n${sessionData.statement_data}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleMenuFlow('ministatement_result', response, {}, sessionData, msisdn, session, shortcode, res);
    }

    async fullstatement(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[STATEMENT] fullstatement: ${msisdn}, session: ${session}`);
        const sessionData = await this.updateSessionMenu(session, 'fullstatement', 'myaccount');

        if (!response) {
            return this.showAccountSelection(sessionData, session, res, 'fullstatement');
        }

        const menuHandlers = {
            '0': () => this.handleBack(sessionData, 'accountServices', 'myaccount', msisdn, session, shortcode, res),
            '00': () => this.handleExit(session, res)
        };

        if (menuHandlers[response]) {
            return await menuHandlers[response]();
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            sessionData.selected_account = accounts[selectedIndex];
            sessionData.current_menu = 'fullstatement_pin';
            await this.ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Enter your PIN to view full statement:\n\n0. Back\n00. Exit');
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async fullstatement_pin(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[STATEMENT] fullstatement_pin: ${msisdn}, session: ${session}`);
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            return this.sendResponse(res, 'con', 'Enter your PIN to view full statement:\n\n0. Back\n00. Exit');
        }

        if (response === '0' || response === '00') {
            return await this.handleMenuFlow('fullstatement_pin', response, {}, sessionData, msisdn, session, shortcode, res);
        }

        if (!await this.verifyPIN(customer, response, msisdn, session, shortcode)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please try again:\n\n0. Back\n00. Exit');
        }

        try {
            const { statementResponse } = await this.ussdService.handleFullStatement(
                customer,
                sessionData.selected_account,
                msisdn,
                session,
                shortcode
            );

            if (statementResponse.STATUS === '000') {
                let statementData = statementResponse.DATA || 'No transactions found';
                
                if (statementData.includes('Full Statement:')) {
                    statementData = statementData.replace('Full Statement:', '').trim();
                }

                sessionData.current_menu = 'fullstatement_result';
                sessionData.statement_data = statementData;
                await this.ussdService.saveSession(session, sessionData);

                const message = `Account: ${sessionData.selected_account}\nFull Statement:\n${statementData}\n\n0. Back\n00. Exit`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = statementResponse.DATA || 'Unable to fetch full statement';
                return this.sendResponse(res, 'end', `Sorry, we couldn't retrieve your full statement. Error: ${errorMsg}`);
            }
        } catch (error) {
            this.logger.error(`[STATEMENT] Full Statement Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    async fullstatement_result(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            const message = `Account: ${sessionData.selected_account}\nFull Statement:\n${sessionData.statement_data}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleMenuFlow('fullstatement_result', response, {}, sessionData, msisdn, session, shortcode, res);
    }
}

module.exports = new StatementService();