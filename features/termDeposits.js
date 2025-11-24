const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class TermDepositsFeature {
    constructor() {
        this.menus = require('../config/menus.json');
        this.depositTypes = [
            { name: 'Fixed Deposit', id: 'FIXEDDEPOSIT' },
            { name: 'Call Deposit', id: 'CALLDEPOSIT' }
        ];
        this.tenures = [
            { name: 'One Month', id: '1 Month' },
            { name: 'Three Months', id: '3 Month' },
            { name: 'Six Months', id: '6 Month' },
            { name: 'Nine Months', id: '9 Month' },
            { name: 'One Year', id: '1 Year' }
        ];
    }

    async termdeposits(customer, msisdn, session, shortcode, response, res) {
        logger.info(`TermDeposits::termdeposits: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'termdeposits';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayDepositTypes(res);
        }

        if (response === '0') {
            return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        }

        const selectedIndex = parseInt(response) - 1;
        if (this.depositTypes[selectedIndex]) {
            const selectedDeposit = this.depositTypes[selectedIndex];
            sessionData.deposit_type = selectedDeposit;
            sessionData.current_menu = 'termdepositstenure';
            await ussdService.saveSession(session, sessionData);
            return await this.termdepositstenure(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.displayDepositTypes(res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async termdepositstenure(customer, msisdn, session, shortcode, response, res) {
        logger.info(`TermDeposits::termdepositstenure: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'termdepositstenure';
            sessionData.previous_menu = 'termdeposits';
            await ussdService.saveSession(session, sessionData);
            return this.displayTenures(res);
        }

        if (response === '0') {
            return await this.termdeposits(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        }

        const selectedIndex = parseInt(response) - 1;
        if (this.tenures[selectedIndex]) {
            const selectedTenure = this.tenures[selectedIndex];
            sessionData.tenure = selectedTenure;
            sessionData.current_menu = 'termdepositsamount';
            await ussdService.saveSession(session, sessionData);
            return await this.termdepositsamount(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.displayTenures(res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async termdepositsamount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`TermDeposits::termdepositsamount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'termdepositsamount';
            sessionData.previous_menu = 'termdepositstenure';
            await ussdService.saveSession(session, sessionData);
            
            const message = 'Enter Amount:\n\n0. Back\n00. Home\n000. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.termdepositstenure(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        }

        // Validate amount
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Home\n000. Exit');
        }

        sessionData.amount = amount;
        sessionData.current_menu = 'termdepositsbankaccount';
        await ussdService.saveSession(session, sessionData);
        return await this.termdepositsbankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async termdepositsbankaccount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`TermDeposits::termdepositsbankaccount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'termdepositsbankaccount';
            sessionData.previous_menu = 'termdepositsamount';
            await ussdService.saveSession(session, sessionData);
            return await this.showAccountSelection(sessionData, session, res, 'termdepositsbankaccount');
        }

        if (response === '0') {
            return await this.termdepositsamount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            const selectedAccount = accounts[selectedIndex];
            sessionData.selected_account = selectedAccount;
            sessionData.current_menu = 'termdepositstransaction';
            await ussdService.saveSession(session, sessionData);
            return await this.termdepositstransaction(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Home\n000. Exit');
        }
    }

    async termdepositstransaction(customer, msisdn, session, shortcode, response, res) {
        logger.info(`TermDeposits::termdepositstransaction: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const amount = sessionData.amount;
            const account = sessionData.selected_account;
            const deposit = sessionData.deposit_type.name;
            const tenure = sessionData.tenure.name;
            
            const message = `Confirm you want to setup a ${tenure} ${deposit} of Ksh ${amount} for account ${account}\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '1') {
            // Process term deposit transaction
            try {
                const transactionResult = await ussdService.handleTermDeposit(
                    customer,
                    sessionData.deposit_type.id,
                    sessionData.tenure.id,
                    sessionData.amount,
                    sessionData.selected_account,
                    msisdn,
                    session,
                    shortcode
                );

                if (transactionResult.STATUS === '000') {
                    this.clearTransactionData(sessionData);
                    const successMessage = `Term deposit setup successful! You will receive confirmation shortly.\n\n0. Back\n00. Home`;
                    return this.sendResponse(res, 'con', successMessage);
                } else {
                    const errorMsg = transactionResult.DATA || 'Term deposit setup failed';
                    return this.sendResponse(res, 'end', `Error: ${errorMsg}`);
                }
            } catch (error) {
                logger.error(`Term Deposit Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Term deposit setup failed. Please try again later.');
            }
        } else if (response === '2') {
            return await this.termdeposits(customer, msisdn, session, shortcode, null, res);
        } else if (response === '0') {
            return await this.termdepositsbankaccount(customer, msisdn, session, shortcode, null, res);
        } else if (response === '00') {
            return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home');
        }
    }

    // Helper methods
    displayDepositTypes(res, prefix = '') {
        let message = prefix + 'Term Deposits:\n\n';
        this.depositTypes.forEach((deposit, index) => {
            message += `${index + 1}. ${deposit.name}\n`;
        });
        message += '\n0. Back\n00. Exit';
        return this.sendResponse(res, 'con', message);
    }

    displayTenures(res, prefix = '') {
        let message = prefix + 'Select Tenure:\n\n';
        this.tenures.forEach((tenure, index) => {
            message += `${index + 1}. ${tenure.name}\n`;
        });
        message += '\n0. Back\n00. Home\n000. Exit';
        return this.sendResponse(res, 'con', message);
    }

    async showAccountSelection(sessionData, session, res, nextMenu) {
        const accounts = sessionData.customer.accounts || [];
        let accountList = '';

        accounts.forEach((account, index) => {
            accountList += `${index + 1}. ${account}\n`;
        });

        sessionData.current_menu = nextMenu;
        await ussdService.saveSession(session, sessionData);

        const message = `Select account:\n${accountList}\n0. Back\n00. Home\n000. Exit`;
        return this.sendResponse(res, 'con', message);
    }

    async handleNavigation(response, sessionData, msisdn, session, shortcode, res) {
        if (response === '0') {
            const previousMenu = sessionData.previous_menu || 'mobilebanking';
            sessionData.current_menu = previousMenu;
            this.clearTransactionData(sessionData);
            await ussdService.saveSession(session, sessionData);
            // This would route to the appropriate feature
            return this.sendResponse(res, 'con', 'Navigation to previous menu');
        } else if (response === '00') {
            await ussdService.deleteSession(session);
            return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
        }
        return this.sendResponse(res, 'con', 'Invalid navigation.');
    }

    clearTransactionData(sessionData) {
        delete sessionData.deposit_type;
        delete sessionData.tenure;
        delete sessionData.amount;
        delete sessionData.selected_account;
    }

    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');
        logger.info(`TERM_DEPOSITS{${type}}: ${message}`);
        logger.info(`TERM_DEPOSITS SIZE: ${messageSize} bytes`);
        
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new TermDepositsFeature();