const baseFeature = require('./baseFeature');

class BalanceService extends baseFeature {
    constructor() {
        super();
    }

    async balance(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[BALANCE] balance: ${msisdn}, session: ${session}`);
        const sessionData = await this.updateSessionMenu(session, 'balance', 'myaccount');

        if (!response) {
            return this.showAccountSelection(sessionData, session, res, 'balance');
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
            sessionData.current_menu = 'balance_pin';
            await this.ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Enter your PIN to check balance:\n\n0. Back\n00. Exit');
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async balance_pin(customer, msisdn, session, shortcode, response, res) {
        this.logger.info(`[BALANCE] balance_pin: ${msisdn}, session: ${session}`);
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            return this.sendResponse(res, 'con', 'Enter your PIN to check balance:\n\n0. Back\n00. Exit');
        }

        if (response === '0' || response === '00') {
            return await this.handleMenuFlow('balance_pin', response, {}, sessionData, msisdn, session, shortcode, res);
        }

        if (!await this.verifyPIN(customer, response, msisdn, session, shortcode)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please try again:\n\n0. Back\n00. Exit');
        }

        try {
            const { balanceResponse } = await this.ussdService.handleBalanceCheck(
                customer,
                sessionData.selected_account,
                msisdn,
                session,
                shortcode
            );

            if (balanceResponse.STATUS === '000' || balanceResponse.STATUS === 'OK') {
                let balance = '0.00';

                if (balanceResponse.DATA) {
                    const data = balanceResponse.DATA;
                    if (data.includes('|')) {
                        const parts = data.split('|');
                        // DEBUG: Log the parts to see what we're getting
                        this.logger.info(`[BALANCE] Parsing balance parts: ${JSON.stringify(parts)}`);

                        // The balance should be at index 3 (0-based)
                        // Format: "Currency|KES|Balance|-2,071,989.49 DR"
                        if (parts.length >= 4) {
                            balance = parts[3].replace(' DR', '').trim();
                            this.logger.info(`[BALANCE] Extracted balance: ${balance}`);
                        }
                    }
                }

                sessionData.current_menu = 'balance_result';
                sessionData.balance = balance;
                await this.ussdService.saveSession(session, sessionData);

                const message = `Account: ${sessionData.selected_account}\nBalance: Ksh ${balance}\n\n0. Back\n00. Exit`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = balanceResponse.DATA || 'Unable to fetch balance';
                return this.sendResponse(res, 'end', `Sorry, we couldn't retrieve your balance. Error: ${errorMsg}`);
            }
        } catch (error) {
            this.logger.error(`[BALANCE] Balance Check Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    async balance_result(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            const message = `Account: ${sessionData.selected_account}\nBalance: Ksh ${sessionData.balance}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleMenuFlow('balance_result', response, {}, sessionData, msisdn, session, shortcode, res);
    }
}

module.exports = new BalanceService();