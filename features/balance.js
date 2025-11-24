const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class BalanceService {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async balance(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[BALANCE] balance: ${msisdn}, session: ${session}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'balance';
            sessionData.previous_menu = 'myaccount';
            await ussdService.saveSession(session, sessionData);
            return this.showAccountSelection(sessionData, session, res, 'balance');
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
            sessionData.current_menu = 'balance_pin';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter your PIN to check balance:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    async balance_pin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`[BALANCE] balance_pin: ${msisdn}, session: ${session}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to check balance:\n\n0. Back\n00. Home';
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

        // Process balance check
        try {
            const { balanceResponse } = await ussdService.handleBalanceCheck(
                customer,
                sessionData.selected_account,
                msisdn,
                session,
                shortcode
            );

            if (balanceResponse.STATUS === '000') {
                let balance = balanceResponse.DATA || '0.00';
                if (balance.includes('Balance:')) {
                    balance = balance.replace('Balance:', '').trim();
                }

                sessionData.current_menu = 'balance_result';
                sessionData.balance = balance;
                await ussdService.saveSession(session, sessionData);

                const message = `Account: ${sessionData.selected_account}\nBalance: Ksh ${balance}\n\n0. Back\n00. Home`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = balanceResponse.DATA || 'Unable to fetch balance';
                return this.sendResponse(res, 'end', `Sorry, we couldn't retrieve your balance. Error: ${errorMsg}`);
            }
        } catch (error) {
            logger.error(`[BALANCE] Balance Check Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    async balance_result(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Account: ${sessionData.selected_account}\nBalance: Ksh ${sessionData.balance}\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    // Helper methods
    async verifyPIN(customer, pin, msisdn, session, shortcode) {
        try {
            const verifiedCustomer = await ussdService.handleLogin(customer, pin, msisdn, session, shortcode);
            return !!verifiedCustomer;
        } catch (error) {
            logger.error(`[BALANCE] PIN Verification Error: ${error.message}`);
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
        logger.info(`[BALANCE] ${type.toUpperCase()}: ${message}`);
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new BalanceService();