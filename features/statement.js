const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class StatementService {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async ministatement(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[STATEMENT] ministatement: ${msisdn}, session: ${session}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'ministatement';
            sessionData.previous_menu = 'myaccount';
            await ussdService.saveSession(session, sessionData);
            return this.showAccountSelection(sessionData, session, res, 'ministatement');
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Handle account selection
        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            const selectedAccount = accounts[selectedIndex];
            sessionData.selected_account = selectedAccount;
            sessionData.current_menu = 'ministatement_pin';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter your PIN to view mini statement:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    async ministatement_pin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[STATEMENT] ministatement_pin: ${msisdn}, session: ${session}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to view mini statement:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Verify PIN first
        const pinVerified = await this.verifyPIN(customer, response, msisdn, session, shortcode);
        if (!pinVerified) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please try again:\n\n0. Back\n00. Home');
        }

        // Get mini statement
        try {
            const { statementResponse } = await ussdService.handleMiniStatement(
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
                await ussdService.saveSession(session, sessionData);

                const message = `Account: ${sessionData.selected_account}\nMini Statement:\n${statementData}\n\n0. Back\n00. Home`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = statementResponse.DATA || 'Unable to fetch mini statement';
                return this.sendResponse(res, 'end', `Sorry, we couldn't retrieve your mini statement. Error: ${errorMsg}`);
            }
        } catch (error) {
            logger.error(`[STATEMENT] Mini Statement Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    async ministatement_result(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Account: ${sessionData.selected_account}\nMini Statement:\n${sessionData.statement_data}\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async fullstatement(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[STATEMENT] fullstatement: ${msisdn}, session: ${session}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'fullstatement';
            sessionData.previous_menu = 'myaccount';
            await ussdService.saveSession(session, sessionData);
            return this.showAccountSelection(sessionData, session, res, 'fullstatement');
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Handle account selection
        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            const selectedAccount = accounts[selectedIndex];
            sessionData.selected_account = selectedAccount;
            sessionData.current_menu = 'fullstatement_pin';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter your PIN to view full statement:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    async fullstatement_pin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[STATEMENT] fullstatement_pin: ${msisdn}, session: ${session}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to view full statement:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Verify PIN first
        const pinVerified = await this.verifyPIN(customer, response, msisdn, session, shortcode);
        if (!pinVerified) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please try again:\n\n0. Back\n00. Home');
        }

        // Get full statement
        try {
            const { statementResponse } = await ussdService.handleFullStatement(
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
                await ussdService.saveSession(session, sessionData);

                const message = `Account: ${sessionData.selected_account}\nFull Statement:\n${statementData}\n\n0. Back\n00. Home`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = statementResponse.DATA || 'Unable to fetch full statement';
                return this.sendResponse(res, 'end', `Sorry, we couldn't retrieve your full statement. Error: ${errorMsg}`);
            }
        } catch (error) {
            logger.error(`[STATEMENT] Full Statement Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    async fullstatement_result(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Account: ${sessionData.selected_account}\nFull Statement:\n${sessionData.statement_data}\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    // Helper methods (same as in BalanceService)
    async verifyPIN(customer, pin, msisdn, session, shortcode) {
        try {
            const verifiedCustomer = await ussdService.handleLogin(customer, pin, msisdn, session, shortcode);
            return !!verifiedCustomer;
        } catch (error) {
            logger.error(`[STATEMENT] PIN Verification Error: ${error.message}`);
            return false;
        }
    }

    async showAccountSelection(sessionData, session, res, nextMenu) {
        const accounts = sessionData.customer.accounts || [];
        let accountList = '';

        accounts.forEach((account, index) => {
            accountList += `${index + 1}. ${account}\n`;
        });

        sessionData.current_menu = nextMenu;
        await ussdService.saveSession(session, sessionData);

        const message = `Select account:\n${accountList}\n0. Back\n00. Home`;
        return this.sendResponse(res, 'con', message);
    }

    async handleNavigation(response, sessionData, msisdn, session, shortcode, res) {
        if (response === '0') {
            // Go back to account services
            const featureManager = require('./index');
            return await featureManager.execute('accountServices', 'myaccount', sessionData.customer, msisdn, session, shortcode, null, res);
        } else if (response === '00') {
            await ussdService.deleteSession(session);
            return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
        }
        return this.sendResponse(res, 'con', 'Invalid navigation.');
    }

    sendResponse(res, type, message) {
        logger.info(`[STATEMENT] ${type.toUpperCase()}: ${message}`);
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new StatementService();