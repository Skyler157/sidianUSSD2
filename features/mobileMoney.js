const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class MobileMoneyFeature {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async mobilemoney(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'mobilemoney';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('mobilemoney', res);
        }

        const menuHandlers = {
            '1': () => this.withdraw(customer, msisdn, session, shortcode, null, res),
            '2': () => this.deposit(customer, msisdn, session, shortcode, null, res),
            '3': () => this.buyfloat(customer, msisdn, session, shortcode, null, res),
            '4': () => this.buygoods(customer, msisdn, session, shortcode, null, res),
            '5': () => this.paybill(customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'mobilemoney');
    }

    async withdraw(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'withdraw';
            sessionData.previous_menu = 'mobilemoney';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('withdraw', res);
        }

        const menuHandlers = {
            '1': () => this.withdrawOwnNumber(customer, msisdn, session, shortcode, null, res),
            '2': () => this.withdrawOtherNumber(customer, msisdn, session, shortcode, null, res),
            '3': () => this.withdrawSavedBeneficiary(customer, msisdn, session, shortcode, null, res),
            '4': () => this.manageWithdrawBeneficiary(customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'withdraw');
    }

    async withdrawmsisdn(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'withdrawmsisdn';
            sessionData.previous_menu = 'withdraw';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter M-PESA mobile number:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate mobile number
        const mobileRegex = /^(254|0)?[17]\d{8}$/;
        let recipientMobile = response;

        // Format mobile number to 254 format
        if (recipientMobile.startsWith('0')) {
            recipientMobile = '254' + recipientMobile.substring(1);
        } else if (!recipientMobile.startsWith('254')) {
            recipientMobile = '254' + recipientMobile;
        }

        if (!mobileRegex.test(recipientMobile)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid M-PESA number:\n\n0. Back\n00. Home');
        }

        sessionData.recipient_mobile = recipientMobile;
        sessionData.current_menu = 'withdrawamount';
        await ussdService.saveSession(session, sessionData);

        const message = `Send to: ${recipientMobile}\nEnter amount:\n\n0. Back\n00. Home`;
        return this.sendResponse(res, 'con', message);
    }

    async withdrawSavedBeneficiary(customer, msisdn, session, shortcode, response, res) {
        // Implementation for saved beneficiaries
        return this.sendResponse(res, 'end', 'Saved beneficiaries feature coming soon.');
    }

    async manageWithdrawBeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'managewithdrawbeneficiary';
            sessionData.previous_menu = 'withdraw';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('managewithdrawbeneficiary', res);
        }

        const menuHandlers = {
            '1': () => this.addWithdrawBeneficiary(customer, msisdn, session, shortcode, null, res),
            '2': () => this.viewWithdrawBeneficiaries(customer, msisdn, session, shortcode, null, res),
            '3': () => this.deleteWithdrawBeneficiary(customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'managewithdrawbeneficiary');
    }

    async addWithdrawBeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'addwithdrawbeneficiary';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter M-PESA mobile number:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate and store mobile number
        sessionData.beneficiary_mobile = response;
        sessionData.current_menu = 'addwithdrawbeneficiaryname';
        await ussdService.saveSession(session, sessionData);

        const message = 'Enter beneficiary name:\n\n0. Back\n00. Home';
        return this.sendResponse(res, 'con', message);
    }

    async addwithdrawbeneficiaryname(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter beneficiary name:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        sessionData.beneficiary_name = response;
        sessionData.current_menu = 'addwithdrawbeneficiaryconfirm';
        await ussdService.saveSession(session, sessionData);

        const message = `Save ${response} - ${sessionData.beneficiary_mobile} as beneficiary?\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home`;
        return this.sendResponse(res, 'con', message);
    }

    async addwithdrawbeneficiaryconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Save ${sessionData.beneficiary_name} - ${sessionData.beneficiary_mobile} as beneficiary?\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        if (response === '1') {
            // Save beneficiary logic here
            return this.sendResponse(res, 'end', 'Beneficiary saved successfully!');
        } else if (response === '2') {
            return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    async viewWithdrawBeneficiaries(customer, msisdn, session, shortcode, response, res) {
        // Implementation to view saved beneficiaries
        return this.sendResponse(res, 'end', 'View beneficiaries feature coming soon.');
    }

    async deleteWithdrawBeneficiary(customer, msisdn, session, shortcode, response, res) {
        // Implementation to delete beneficiaries
        return this.sendResponse(res, 'end', 'Delete beneficiary feature coming soon.');
    }

    async transaction_success(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Transaction successful!\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async transaction_failed(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Transaction failed. Please try again.\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async withdrawOwnNumber(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'withdrawmsisdn';
            sessionData.previous_menu = 'withdraw';
            sessionData.recipient_mobile = msisdn; // Use customer's own number
            await ussdService.saveSession(session, sessionData);

            const message = `Send to your M-PESA: ${msisdn}\nEnter amount:\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Handle amount input
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Home');
        }

        sessionData.amount = amount;
        sessionData.current_menu = 'withdrawbankaccount';
        await ussdService.saveSession(session, sessionData);

        return this.showAccountSelection(sessionData, session, res, 'withdrawbankaccount');
    }

    async withdrawOtherNumber(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'withdrawmsisdn';
            sessionData.previous_menu = 'withdraw';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter M-PESA mobile number:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate mobile number
        const mobileRegex = /^(254|0)?[17]\d{8}$/;
        let recipientMobile = response;

        // Format mobile number to 254 format
        if (recipientMobile.startsWith('0')) {
            recipientMobile = '254' + recipientMobile.substring(1);
        } else if (!recipientMobile.startsWith('254')) {
            recipientMobile = '254' + recipientMobile;
        }

        if (!mobileRegex.test(recipientMobile)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid M-PESA number:\n\n0. Back\n00. Home');
        }

        sessionData.recipient_mobile = recipientMobile;
        sessionData.current_menu = 'withdrawamount';
        await ussdService.saveSession(session, sessionData);

        const message = `Send to: ${recipientMobile}\nEnter amount:\n\n0. Back\n00. Home`;
        return this.sendResponse(res, 'con', message);
    }

    async withdrawamount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Send to: ${sessionData.recipient_mobile}\nEnter amount:\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Handle amount input
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Home');
        }

        sessionData.amount = amount;
        sessionData.current_menu = 'withdrawbankaccount';
        await ussdService.saveSession(session, sessionData);

        return this.showAccountSelection(sessionData, session, res, 'withdrawbankaccount');
    }

    async withdrawbankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            return this.showAccountSelection(sessionData, session, res, 'withdrawbankaccount');
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
            sessionData.current_menu = 'withdrawconfirm';
            await ussdService.saveSession(session, sessionData);

            const message = `Confirm sending Ksh ${sessionData.amount} to M-PESA ${sessionData.recipient_mobile} from account ${selectedAccount}\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        } else {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    async withdrawconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Confirm sending Ksh ${sessionData.amount} to M-PESA ${sessionData.recipient_mobile} from account ${sessionData.selected_account}\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        if (response === '1') {
            // Confirm withdrawal
            sessionData.current_menu = 'withdrawpin';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter your PIN to confirm transaction:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        } else if (response === '2') {
            // Cancel transaction
            return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Home');
        }
    }

    async withdrawpin(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to confirm transaction:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Verify PIN and process withdrawal
        const pinVerified = await this.verifyPIN(customer, response, msisdn, session, shortcode);
        if (!pinVerified) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please try again:\n\n0. Back\n00. Home');
        }

        try {
            // Process withdrawal
            const result = await ussdService.handleWithdraw(
                customer,
                sessionData.selected_account,
                sessionData.recipient_mobile,
                sessionData.amount,
                response, // PIN
                msisdn,
                session,
                shortcode
            );

            if (result.STATUS === '000') {
                const message = `Transaction successful! Ksh ${sessionData.amount} sent to ${sessionData.recipient_mobile}\n\n0. Back\n00. Home`;
                sessionData.current_menu = 'transaction_success';
                await ussdService.saveSession(session, sessionData);
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = result.DATA || 'Transaction failed';
                return this.sendResponse(res, 'end', `Transaction failed: ${errorMsg}`);
            }
        } catch (error) {
            logger.error(`[MOBILEMONEY] Withdrawal Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    // Add other methods (deposit, buyfloat, etc.) with similar structure
    async deposit(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'deposit';
            sessionData.previous_menu = 'mobilemoney';
            await ussdService.saveSession(session, sessionData);

            const message = 'Enter amount to deposit from M-PESA:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Handle amount input
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Home');
        }

        sessionData.amount = amount;
        sessionData.current_menu = 'depositbankaccount';
        await ussdService.saveSession(session, sessionData);

        return this.showAccountSelection(sessionData, session, res, 'depositbankaccount');
    }

    async depositbankaccount(customer, msisdn, session, shortcode, response, res) {
        // Similar to withdrawbankaccount but for deposit
        // Implementation here
    }

    async buyfloat(customer, msisdn, session, shortcode, response, res) {
        // Implementation for buy float
        return this.sendResponse(res, 'end', 'Buy Float service coming soon.');
    }

    async buygoods(customer, msisdn, session, shortcode, response, res) {
        // Implementation for buy goods
        return this.sendResponse(res, 'end', 'Buy Goods service coming soon.');
    }

    async paybill(customer, msisdn, session, shortcode, response, res) {
        // Implementation for paybill
        return this.sendResponse(res, 'end', 'Paybill service coming soon.');
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
        if (response === '0') {
            // Go back to previous menu
            const previousMenu = sessionData.previous_menu || 'mobilebanking';
            sessionData.current_menu = previousMenu;
            await ussdService.saveSession(session, sessionData);

            const featureManager = require('./index');
            return await featureManager.execute('navigation', 'mobilebanking', sessionData.customer, msisdn, session, shortcode, null, res);
        } else if (response === '00') {
            await ussdService.deleteSession(session);
            return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
        }
        return this.sendResponse(res, 'con', 'Invalid navigation.');
    }

    async verifyPIN(customer, pin, msisdn, session, shortcode) {
        try {
            const verifiedCustomer = await ussdService.handleLogin(customer, pin, msisdn, session, shortcode);
            return !!verifiedCustomer;
        } catch (error) {
            logger.error(`[MOBILEMONEY] PIN Verification Error: ${error.message}`);
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
        logger.info(`MOBILE_MONEY_MENU{${type}}: ${message}`);
        logger.info(`MOBILE_MONEY_MENU SIZE: ${messageSize} bytes`);

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new MobileMoneyFeature();