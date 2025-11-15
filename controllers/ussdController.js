const ussdService = require('../services/ussdService');
const apiService = require('../services/apiService');
const logger = require('../services/logger');

class USSDController {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async handleUSSD(req, res) {
        const { sessionId, msisdn, shortcode = '527', response = '' } = req.body;

        // Log session start
        ussdService.logSessionStart(sessionId, msisdn);

        logger.info(`USSDController::root: [${JSON.stringify({ sessionId, msisdn, shortcode, response })}]`);

        try {
            // Get existing session or start new
            const sessionData = await ussdService.getSession(sessionId);

            if (!sessionData) {
                return await this.home(null, msisdn, sessionId, shortcode, response, res);
            }

            const currentMenu = sessionData.current_menu || 'home';
            const customer = sessionData.customer || null;

            return await this[currentMenu](customer, msisdn, sessionId, shortcode, response, res);
        } catch (error) {
            logger.error(`USSD Handler Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    async home(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::home: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        // Validate parameters
        if (!msisdn || !session || !shortcode) {
            logger.error(`Missing required parameters: msisdn=${msisdn}, session=${session}, shortcode=${shortcode}`);
            return this.sendResponse(res, 'end', 'System error. Invalid parameters.');
        }

        if (!customer) {
            // First time - get customer info
            customer = await ussdService.handleCustomerLookup(msisdn, session, shortcode);

            if (!customer) {
                return this.sendResponse(res, 'end', 'Unable to retrieve customer information. Please try again later.');
            }

            logger.info(`USSDController::customer: ${JSON.stringify({
                customer,
                msisdn,
                session,
                shortcode,
                action: 'getcustomer'
            })}`);
        }

        if (!response) {
            const sessionData = {
                customer,
                current_menu: 'home',
                previous_menu: 'home'
            };

            await ussdService.saveSession(session, sessionData);

            const message = this.menus.home.message.replace('{firstname}', customer.firstname);
            return this.sendResponse(res, 'con', message);
        }

        logger.info(`PIN entered by ${msisdn}: ${response}`);

        if (response === '1') {
            // PIN reset flow
            return this.sendResponse(res, 'end', 'Please visit your nearest branch to reset your PIN.');
        }

        // Attempt login with PIN
        const loggedInCustomer = await ussdService.handleLogin(customer, response, msisdn, session, shortcode);

        logger.info(`USSDController::customer: ${JSON.stringify({
            customer: loggedInCustomer,
            msisdn,
            session,
            shortcode,
            action: 'login'
        })}`);

        if (loggedInCustomer) {
            // Login successful
            loggedInCustomer.loggedIn = true;
            const sessionData = {
                customer: loggedInCustomer,
                current_menu: 'mobilebanking',
                previous_menu: 'home'
            };

            await ussdService.saveSession(session, sessionData);

            return await this.mobilebanking(loggedInCustomer, msisdn, session, shortcode, null, res);
        } else {
            const message = 'Invalid PIN. Please enter your PIN:';
            return this.sendResponse(res, 'con', message);
        }
    }

    async mobilebanking(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::mobilebanking: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'mobilebanking';
            sessionData.previous_menu = 'home';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('mobilebanking', res);
        }

        const menu = this.menus.mobilebanking;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    return await this.myaccount(customer, msisdn, session, shortcode, null, res);
                case '2':
                    return await this.mobilemoney(customer, msisdn, session, shortcode, null, res);
                case '3':
                    return await this.airtime(customer, msisdn, session, shortcode, null, res);
                case '4':
                    return await this.fundstransfer(customer, msisdn, session, shortcode, null, res);
                case '5':
                    return await this.billpayment(customer, msisdn, session, shortcode, null, res);
                case '6':
                    return await this.paymerchant(customer, msisdn, session, shortcode, null, res);
                case '7':
                    return await this.changepin(customer, msisdn, session, shortcode, null, res);
                case '0':
                    await ussdService.deleteSession(session);
                    return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
                default:
                    return this.displayMenu('mobilebanking', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('mobilebanking', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async myaccount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::myaccount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'myaccount';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('myaccount', res);
        }

        const menu = this.menus.myaccount;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    return await this.balance(customer, msisdn, session, shortcode, null, res);
                case '2':
                    return await this.ministatement(customer, msisdn, session, shortcode, null, res);
                case '3':
                    return await this.fullstatement(customer, msisdn, session, shortcode, null, res);
                case '0':
                case '00':
                    return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('myaccount', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('myaccount', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async balance(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::balance: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // First time - show account selection
            sessionData.current_menu = 'balance';
            sessionData.previous_menu = 'myaccount';
            await ussdService.saveSession(session, sessionData);

            return await this.showAccountSelection(sessionData, session, res, 'balance');
        }

        // Handle account selection
        if (sessionData.current_menu === 'balance') {
            const selectedIndex = parseInt(response) - 1;
            const accounts = sessionData.customer.accounts || [];

            if (accounts[selectedIndex]) {
                const selectedAccount = accounts[selectedIndex];

                // Store selected account and ask for PIN
                sessionData.selected_account = selectedAccount;
                sessionData.current_menu = 'balance_pin';
                await ussdService.saveSession(session, sessionData);

                const message = 'Enter your PIN to check balance:';
                return this.sendResponse(res, 'con', message);
            } else {
                return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
            }
        }

        // Handle PIN entry for balance
        if (sessionData.current_menu === 'balance_pin') {
            // Verify PIN (you might want to add PIN verification logic here)
            // For now, we'll proceed directly to balance check

            const { charge, balanceResponse } = await ussdService.handleBalanceCheck(
                customer,
                sessionData.selected_account,
                msisdn,
                session,
                shortcode
            );

            if (balanceResponse.STATUS === '000') {
                let balance = balanceResponse.DATA || '0.00';

                // Clean up balance display
                if (balance.includes('Balance:')) {
                    balance = balance.replace('Balance:', '').trim();
                }

                sessionData.current_menu = 'balance_result';
                sessionData.balance = balance;
                await ussdService.saveSession(session, sessionData);

                const message = `Account: ${sessionData.selected_account}\nBalance: Ksh ${balance}\n\n0. Back\n00. Exit`;
                return this.sendResponse(res, 'con', message);
            } else {
                const errorMsg = balanceResponse.DATA || 'Unable to fetch balance';
                return this.sendResponse(res, 'end', `Error: ${errorMsg}`);
            }
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }
    async balance_result(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::balance_result: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // Show balance again with navigation options
            const message = `Account: ${sessionData.selected_account}\nBalance: Ksh ${sessionData.balance}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async balance_pin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::balance_pin: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to check balance:\n\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        // Handle navigation options first
        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Verify PIN (you can add PIN verification logic here if needed)
        // For now, we'll proceed with balance check

        const { charge, balanceResponse } = await ussdService.handleBalanceCheck(
            customer,
            sessionData.selected_account,
            msisdn,
            session,
            shortcode
        );

        if (balanceResponse.STATUS === '000') {
            let balance = balanceResponse.DATA || '0.00';

            // Clean up balance display
            if (balance.includes('Balance:')) {
                balance = balance.replace('Balance:', '').trim();
            }

            sessionData.current_menu = 'balance_result';
            sessionData.balance = balance;
            await ussdService.saveSession(session, sessionData);

            const message = `Account: ${sessionData.selected_account}\nBalance: Ksh ${balance}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        } else {
            const errorMsg = balanceResponse.DATA || 'Unable to fetch balance';
            return this.sendResponse(res, 'end', `Error: ${errorMsg}`);
        }
    }

    // Mobile Money
    async mobilemoney(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::mobilemoney: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'mobilemoney';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('mobilemoney', res);
        }

        const menu = this.menus.mobilemoney;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    return await this.withdraw(customer, msisdn, session, shortcode, null, res);
                case '2':
                    return await this.deposit(customer, msisdn, session, shortcode, null, res);
                case '3':
                    return await this.buyfloat(customer, msisdn, session, shortcode, null, res);
                case '4':
                    return await this.buygoods(customer, msisdn, session, shortcode, null, res);
                case '5':
                    return await this.paybill(customer, msisdn, session, shortcode, null, res);
                case '0':
                case '00':
                    return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('mobilemoney', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('mobilemoney', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    // WITHDRAW FLOW (Account to M-PESA)
    async withdraw(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::withdraw: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'withdraw';
            sessionData.previous_menu = 'mobilemoney';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('withdraw', res);
        }

        const menu = this.menus.withdraw;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    // Own number
                    sessionData.withdraw_type = 'own';
                    sessionData.mobile_number = msisdn;
                    sessionData.current_menu = 'withdrawamount';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('withdrawamount', res);
                case '2':
                    // Other number
                    sessionData.withdraw_type = 'other';
                    sessionData.current_menu = 'withdrawmsisdn';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('withdrawmsisdn', res);
                case '3':
                    // Saved beneficiary
                    return await this.withdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
                case '4':
                    // Manage beneficiaries
                    return await this.managewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
                case '0':
                case '00':
                    return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('withdraw', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('withdraw', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async withdrawmsisdn(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::withdrawmsisdn: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // Add navigation options to the input screen
            const message = this.menus.withdrawmsisdn.message + '\n\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        // Handle navigation first
        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate mobile number
        if (!this.validateMobileNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid 07XXX or 01XXX number:\n\n0. Back\n00. Exit');
        }

        // Convert to 254 format
        const formattedMobile = this.formatMobileNumber(response);
        sessionData.mobile_number = formattedMobile;
        sessionData.current_menu = 'withdrawamount';
        await ussdService.saveSession(session, sessionData);

        return this.displayMenu('withdrawamount', res);
    }

    async withdrawamount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::withdrawamount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // Add navigation options to the input screen
            const message = this.menus.withdrawamount.message + '\n\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        // Handle navigation first
        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate amount
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.amount = amount;
        sessionData.current_menu = 'withdrawbankaccount';
        await ussdService.saveSession(session, sessionData);

        return await this.showAccountSelection(sessionData, session, res, 'withdrawbankaccount');
    }

    async withdrawbankaccount(customer, msisdn, session, shortcode, response, res) {
    logger.info(`USSDController::withdrawbankaccount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

    const sessionData = await ussdService.getSession(session);

    if (!response) {
        return await this.showAccountSelection(sessionData, session, res, 'withdrawbankaccount');
    }

    // Handle account selection
    const selectedIndex = parseInt(response) - 1;
    const accounts = sessionData.customer.accounts || [];

    if (accounts[selectedIndex]) {
        const selectedAccount = accounts[selectedIndex];
        sessionData.selected_account = selectedAccount;
        sessionData.current_menu = 'withdrawconfirm';
        await ussdService.saveSession(session, sessionData);

        // Format mobile for display (convert 254 to 0XXX)
        const displayMobile = sessionData.mobile_number.startsWith('254') ?
            '0' + sessionData.mobile_number.substring(3) : sessionData.mobile_number;

        // Create confirmation message with explicit options
        const message = `Confirm sending Ksh ${sessionData.amount} to M-PESA ${displayMobile} from account ${sessionData.selected_account}\n\n1. Confirm\n2. Cancel\n\n00. Exit`;

        return this.sendResponse(res, 'con', message);
    } else {
        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }
}

async withdrawconfirm(customer, msisdn, session, shortcode, response, res) {
    logger.info(`USSDController::withdrawconfirm: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

    const sessionData = await ussdService.getSession(session);

    if (!response) {
        // Show confirmation with properly formatted message and options
        const displayMobile = sessionData.mobile_number.startsWith('254') ?
            '0' + sessionData.mobile_number.substring(3) : sessionData.mobile_number;

        const message = `Confirm sending Ksh ${sessionData.amount} to M-PESA ${displayMobile} from account ${sessionData.selected_account}\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Exit`;

        return this.sendResponse(res, 'con', message);
    }

    switch (response) {
        case '1':
            // Confirm - proceed to PIN entry
            sessionData.current_menu = 'withdrawpin';
            await ussdService.saveSession(session, sessionData);

            const pinMessage = 'Enter your PIN to confirm transaction:\n\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', pinMessage);

        case '2':
            // Cancel - go back to withdraw menu
            this.clearTransactionData(sessionData);
            sessionData.current_menu = 'withdraw';
            await ussdService.saveSession(session, sessionData);
            return await this.withdraw(customer, msisdn, session, shortcode, null, res);

        case '0':
            // Back to account selection
            sessionData.current_menu = 'withdrawbankaccount';
            await ussdService.saveSession(session, sessionData);
            return await this.withdrawbankaccount(customer, msisdn, session, shortcode, null, res);

        case '00':
            // Exit completely
            await ussdService.deleteSession(session);
            return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');

        default:
            // Invalid selection - show confirmation again with error message
            const displayMobile = sessionData.mobile_number.startsWith('254') ?
                '0' + sessionData.mobile_number.substring(3) : sessionData.mobile_number;

            const errorMessage = `Invalid selection. Please try again.\n\nConfirm sending Ksh ${sessionData.amount} to M-PESA ${displayMobile} from account ${sessionData.selected_account}\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
            return this.sendResponse(res, 'con', errorMessage);
    }
}

async withdrawpin(customer, msisdn, session, shortcode, response, res) {
    logger.info(`USSDController::withdrawpin: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

    const sessionData = await ussdService.getSession(session);

    if (!response) {
        const message = 'Enter your PIN to confirm transaction:\n\n0. Back\n00. Exit';
        return this.sendResponse(res, 'con', message);
    }

    // Handle navigation first
    if (response === '0' || response === '00') {
        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    // Process the withdrawal transaction
    try {
        const transactionResult = await ussdService.handleWithdraw(
            customer,
            sessionData.selected_account,
            sessionData.mobile_number,
            sessionData.amount,
            response, // PIN
            msisdn,
            session,
            shortcode
        );

        if (transactionResult.STATUS === '000') {
            // Transaction successful
            this.clearTransactionData(sessionData);

            const displayMobile = sessionData.mobile_number.startsWith('254') ?
                '0' + sessionData.mobile_number.substring(3) : sessionData.mobile_number;

            const successMessage = `Transaction successful! Ksh ${sessionData.amount} sent to M-PESA ${displayMobile}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', successMessage);
        } else {
            // Transaction failed
            const errorMsg = transactionResult.DATA || 'Transaction failed';
            return this.sendResponse(res, 'end', `Transaction failed: ${errorMsg}`);
        }

    } catch (error) {
        logger.error(`Withdrawal transaction error: ${error.message}`);
        return this.sendResponse(res, 'end', 'Transaction failed. Please try again later.');
    }
}

    async withdrawconfirm(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::withdrawconfirm: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // Show confirmation with properly formatted message and options
            const displayMobile = sessionData.mobile_number.startsWith('254') ?
                '0' + sessionData.mobile_number.substring(3) : sessionData.mobile_number;

            const message = `Confirm sending Ksh ${sessionData.amount} to M-PESA ${displayMobile} from account ${sessionData.selected_account}\n\n1. Confirm\n2. Cancel\n\n00. Exit`;

            return this.sendResponse(res, 'con', message);
        }

        switch (response) {
            case '1':
                // Confirm - proceed to PIN entry
                sessionData.current_menu = 'withdrawpin';
                await ussdService.saveSession(session, sessionData);

                const pinMessage = 'Enter your PIN to confirm transaction:\n\n0. Back\n00. Exit';
                return this.sendResponse(res, 'con', pinMessage);

            case '2':
                // Cancel - go back to withdraw menu
                this.clearTransactionData(sessionData);
                sessionData.current_menu = 'withdraw';
                await ussdService.saveSession(session, sessionData);
                return await this.withdraw(customer, msisdn, session, shortcode, null, res);

            case '0':
                // Back to account selection
                sessionData.current_menu = 'withdrawbankaccount';
                await ussdService.saveSession(session, sessionData);
                return await this.withdrawbankaccount(customer, msisdn, session, shortcode, null, res);

            case '00':
                // Exit completely
                await ussdService.deleteSession(session);
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');

            default:
                // Invalid selection - show confirmation again with error message
                const displayMobile = sessionData.mobile_number.startsWith('254') ?
                    '0' + sessionData.mobile_number.substring(3) : sessionData.mobile_number;

                const errorMessage = `Invalid selection. Please try again.\n\nConfirm sending Ksh ${sessionData.amount} to M-PESA ${displayMobile} from account ${sessionData.selected_account}\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
                return this.sendResponse(res, 'con', errorMessage);
        }
    }

    async withdrawpin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::withdrawpin: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to confirm transaction:\n\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        // Handle navigation first
        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Process the withdrawal transaction
        try {
            const transactionResult = await ussdService.handleWithdraw(
                customer,
                sessionData.selected_account,
                sessionData.mobile_number,
                sessionData.amount,
                response, // PIN
                msisdn,
                session,
                shortcode
            );

            if (transactionResult.STATUS === '000') {
                // Transaction successful
                this.clearTransactionData(sessionData);

                const displayMobile = sessionData.mobile_number.startsWith('254') ?
                    '0' + sessionData.mobile_number.substring(3) : sessionData.mobile_number;

                const successMessage = `Transaction successful! Ksh ${sessionData.amount} sent to M-PESA ${displayMobile}\n\n0. Back\n00. Exit`;
                return this.sendResponse(res, 'con', successMessage);
            } else {
                // Transaction failed
                const errorMsg = transactionResult.DATA || 'Transaction failed';
                return this.sendResponse(res, 'end', `Transaction failed: ${errorMsg}`);
            }

        } catch (error) {
            logger.error(`Withdrawal transaction error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Transaction failed. Please try again later.');
        }
    }

    // DEPOSIT FLOW (M-PESA to Account)
    async deposit(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::deposit: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'deposit';
            sessionData.previous_menu = 'mobilemoney';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('deposit', res);
        }

        // Handle navigation first
        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate amount
        const amount = parseFloat(response);
        if (isNaN(amount) || amount <= 0) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter a valid amount:\n\n0. Back\n00. Exit');
        }

        sessionData.amount = amount;
        sessionData.current_menu = 'depositbankaccount';
        await ussdService.saveSession(session, sessionData);

        return await this.showAccountSelection(sessionData, session, res, 'depositbankaccount');
    }

    async depositbankaccount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::depositbankaccount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            return await this.showAccountSelection(sessionData, session, res, 'depositbankaccount');
        }

        // Handle account selection
        const selectedIndex = parseInt(response) - 1;
        const accounts = sessionData.customer.accounts || [];

        if (accounts[selectedIndex]) {
            const selectedAccount = accounts[selectedIndex];
            sessionData.selected_account = selectedAccount;
            sessionData.current_menu = 'depositconfirm';
            await ussdService.saveSession(session, sessionData);

            const message = this.menus.depositconfirm.message
                .replace('{amount}', sessionData.amount)
                .replace('{account}', selectedAccount);

            return this.displayMenu('depositconfirm', res, message);
        } else {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }
    }

    async depositconfirm(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::depositconfirm: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = this.menus.depositconfirm.message
                .replace('{amount}', sessionData.amount)
                .replace('{account}', sessionData.selected_account);

            return this.displayMenu('depositconfirm', res, message);
        }

        switch (response) {
            case '1':
                // Process deposit transaction
                try {
                    const transactionResult = await ussdService.handleDeposit(
                        customer,
                        sessionData.selected_account,
                        sessionData.amount,
                        msisdn,
                        session,
                        shortcode
                    );

                    if (transactionResult.STATUS === '000') {
                        this.clearTransactionData(sessionData);
                        const successMessage = `Deposit initiated! You will receive an M-PESA prompt to complete deposit of Ksh ${sessionData.amount}\n\n0. Back\n00. Exit`;
                        return this.sendResponse(res, 'con', successMessage);
                    } else {
                        const errorMsg = transactionResult.DATA || 'Deposit failed';
                        return this.sendResponse(res, 'end', `Deposit failed: ${errorMsg}`);
                    }

                } catch (error) {
                    logger.error(`Deposit transaction error: ${error.message}`);
                    return this.sendResponse(res, 'end', 'Deposit failed. Please try again later.');
                }

            case '2':
                // Cancel
                this.clearTransactionData(sessionData);
                sessionData.current_menu = 'mobilemoney';
                await ussdService.saveSession(session, sessionData);
                return await this.mobilemoney(customer, msisdn, session, shortcode, null, res);

            case '0':
            case '00':
                return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);

            default:
                return this.displayMenu('depositconfirm', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    // BENEFICIARY MANAGEMENT
    async managewithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::managewithdrawbeneficiary: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'managewithdrawbeneficiary';
            sessionData.previous_menu = 'withdraw';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('managewithdrawbeneficiary', res);
        }

        const menu = this.menus.managewithdrawbeneficiary;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    return await this.addwithdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
                case '2':
                    return await this.viewwithdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
                case '3':
                    return await this.deletewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
                case '0':
                case '00':
                    return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('managewithdrawbeneficiary', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('managewithdrawbeneficiary', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    // PLACEHOLDER FUNCTIONS FOR OTHER MOBILE MONEY OPTIONS
    async buyfloat(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::buyfloat: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'buyfloat';
            sessionData.previous_menu = 'mobilemoney';
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Buy Float service coming soon.\n\n0. Back\n00. Exit');
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async buygoods(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::buygoods: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'buygoods';
            sessionData.previous_menu = 'mobilemoney';
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Buy Goods service coming soon.\n\n0. Back\n00. Exit');
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async paybill(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::paybill: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'paybill';
            sessionData.previous_menu = 'mobilemoney';
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Paybill service coming soon.\n\n0. Back\n00. Exit');
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    // PLACEHOLDER FOR BENEFICIARY FUNCTIONS
    async withdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::withdrawbeneficiary: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'withdrawbeneficiary';
            sessionData.previous_menu = 'withdraw';
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Beneficiary service coming soon.\n\n0. Back\n00. Exit');
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async addwithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::addwithdrawbeneficiary: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'addwithdrawbeneficiary';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Add beneficiary service coming soon.\n\n0. Back\n00. Exit');
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async viewwithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::viewwithdrawbeneficiary: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'viewwithdrawbeneficiary';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'View beneficiaries service coming soon.\n\n0. Back\n00. Exit');
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async deletewithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::deletewithdrawbeneficiary: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'deletewithdrawbeneficiary';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', 'Delete beneficiary service coming soon.\n\n0. Back\n00. Exit');
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    // HELPER METHODS
    validateMobileNumber(mobile) {
        // Validate Kenyan mobile numbers: 07XXX, 01XXX, 2547XXX, 2541XXX
        const mobileRegex = /^(07[0-9]{8}|01[0-9]{8}|2547[0-9]{8}|2541[0-9]{8})$/;
        return mobileRegex.test(mobile);
    }

    formatMobileNumber(mobile) {
        // Convert to 254 format
        if (mobile.startsWith('0')) {
            return '254' + mobile.substring(1);
        }
        return mobile;
    }

    async airtime(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'airtime';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('airtime', res);
        }

        const menu = this.menus.airtime;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    sessionData.transaction_type = 'buyownairtime';
                    sessionData.current_menu = 'buyownairtime';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('buyownairtime', res);
                case '2':
                    sessionData.transaction_type = 'buyotherairtime';
                    sessionData.current_menu = 'buyotherairtime';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('buyotherairtime', res);
                case '0':
                    return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
                case '00':
                    return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('airtime', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('airtime', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async fundstransfer(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'fundstransfer';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('fundstransfer', res);
        }

        const menu = this.menus.fundstransfer;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    sessionData.transaction_type = 'transferown';
                    sessionData.current_menu = 'transferown';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('transferown', res);
                case '2':
                    sessionData.transaction_type = 'transferother';
                    sessionData.current_menu = 'transferother';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('transferother', res);
                case '0':
                    return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
                case '00':
                    return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('fundstransfer', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('fundstransfer', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async billpayment(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'billpayment';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);

            return this.displayMenu('billpayment', res);
        }

        const menu = this.menus.billpayment;
        const option = menu.options[response];

        if (option) {
            sessionData.bill_type = response;
            switch (response) {
                case '1':
                    sessionData.bill_name = 'DStv';
                    sessionData.current_menu = 'dstv';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('dstv', res);
                case '2':
                    sessionData.bill_name = 'GOtv';
                    sessionData.current_menu = 'gotv';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('gotv', res);
                case '3':
                    sessionData.current_menu = 'zuku';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('zuku', res);
                case '4':
                    sessionData.bill_name = 'StarTimes';
                    sessionData.current_menu = 'startimes';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('startimes', res);
                case '5':
                    sessionData.bill_name = 'Nairobi Water';
                    sessionData.current_menu = 'nairobiwater';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('nairobiwater', res);
                case '6':
                    sessionData.bill_name = 'JTL';
                    sessionData.current_menu = 'jtl';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('jtl', res);
                case '0':
                    return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
                case '00':
                    return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('billpayment', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('billpayment', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async zuku(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'zuku';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('zuku', res);
        }

        const menu = this.menus.zuku;
        const option = menu.options[response];

        if (option) {
            switch (response) {
                case '1':
                    sessionData.bill_name = 'Zuku Satellite';
                    sessionData.current_menu = 'zukusatellite';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('zukusatellite', res);
                case '2':
                    sessionData.bill_name = 'Zuku Tripple Play';
                    sessionData.current_menu = 'zukutrippleplay';
                    await ussdService.saveSession(session, sessionData);
                    return this.displayMenu('zukutrippleplay', res);
                case '0':
                    return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
                case '00':
                    return await this.handleNavigation('00', sessionData, msisdn, session, shortcode, res);
                default:
                    return this.displayMenu('zuku', res, 'Invalid selection. Please try again.\n\n');
            }
        } else {
            return this.displayMenu('zuku', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async paymerchant(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'paymerchant';
            sessionData.previous_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('paymerchant', res);
        }

        // Handle merchant code input and subsequent flow
        sessionData.merchant_code = response;
        sessionData.current_menu = 'paymerchant_confirm';
        await ussdService.saveSession(session, sessionData);

        // In real implementation, you'd validate merchant code here and get merchant name
        const merchantName = "Sample Merchant"; // This should come from API
        const message = this.menus.paymerchant_confirm.message.replace('{merchant_name}', merchantName);
        return this.displayMenu('paymerchant_confirm', res, message);
    }

    async changepin(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'changepin';
            sessionData.previous_menu = 'mobilebanking';
            sessionData.pin_stage = 'enter_old_pin';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('changepin', res);
        }

        // Handle PIN change flow
        switch (sessionData.pin_stage) {
            case 'enter_old_pin':
                sessionData.old_pin = response;
                sessionData.pin_stage = 'enter_new_pin';
                await ussdService.saveSession(session, sessionData);
                return this.displayMenu('changepin_new', res);
            case 'enter_new_pin':
                sessionData.new_pin = response;
                sessionData.pin_stage = 'reenter_new_pin';
                await ussdService.saveSession(session, sessionData);
                return this.displayMenu('changepin_confirm', res);
            case 'reenter_new_pin':
                if (response === sessionData.new_pin) {
                    // PINs match - implement PIN change API call here
                    await ussdService.deleteSession(session);
                    return this.displayMenu('changepin_success', res);
                } else {
                    return this.sendResponse(res, 'end', 'PINs do not match. Please try again.');
                }
            default:
                return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }
    }
    async ministatement(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::ministatement: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // First time - show account selection
            sessionData.current_menu = 'ministatement';
            sessionData.previous_menu = 'myaccount';
            await ussdService.saveSession(session, sessionData);

            return await this.showAccountSelection(sessionData, session, res, 'ministatement');
        }

        // Handle account selection
        if (sessionData.current_menu === 'ministatement') {
            const selectedIndex = parseInt(response) - 1;
            const accounts = sessionData.customer.accounts || [];

            if (accounts[selectedIndex]) {
                const selectedAccount = accounts[selectedIndex];

                // Store selected account and ask for PIN
                sessionData.selected_account = selectedAccount;
                sessionData.current_menu = 'ministatement_pin';
                await ussdService.saveSession(session, sessionData);

                const message = 'Enter your PIN to view mini statement:\n\n0. Back\n00. Home';
                return this.sendResponse(res, 'con', message);
            } else {
                return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
            }
        }

        // Handle PIN entry for mini statement
        if (sessionData.current_menu === 'ministatement_pin') {
            return await this.ministatement_pin(customer, msisdn, session, shortcode, response, res);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async ministatement_result(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::ministatement_result: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // Show statement again with navigation options
            const message = `Account: ${sessionData.selected_account}\nMini Statement:\n${sessionData.statement_data}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async ministatement_pin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::ministatement_pin: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to view mini statement:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        // Handle navigation options first
        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Get mini statement
        const { charge, statementResponse } = await ussdService.handleMiniStatement(
            customer,
            sessionData.selected_account,
            msisdn,
            session,
            shortcode
        );

        if (statementResponse.STATUS === '000') {
            let statementData = statementResponse.DATA || 'No transactions found';

            // Clean up statement display
            if (statementData.includes('Mini Statement:')) {
                statementData = statementData.replace('Mini Statement:', '').trim();
            }

            sessionData.current_menu = 'ministatement_result';
            sessionData.statement_data = statementData;
            await ussdService.saveSession(session, sessionData);

            const message = `Account: ${sessionData.selected_account}\nMini Statement:\n${statementData}\n\n0. Back\n00. Home\n000. Exit`;
            return this.sendResponse(res, 'con', message);
        } else {
            const errorMsg = statementResponse.DATA || 'Unable to fetch mini statement';
            return this.sendResponse(res, 'end', `Error: ${errorMsg}`);
        }
    }

    async fullstatement(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::fullstatement: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // First time - show account selection
            sessionData.current_menu = 'fullstatement';
            sessionData.previous_menu = 'myaccount';
            await ussdService.saveSession(session, sessionData);

            return await this.showAccountSelection(sessionData, session, res, 'fullstatement');
        }

        // Handle account selection
        if (sessionData.current_menu === 'fullstatement') {
            const selectedIndex = parseInt(response) - 1;
            const accounts = sessionData.customer.accounts || [];

            if (accounts[selectedIndex]) {
                const selectedAccount = accounts[selectedIndex];

                // Store selected account and ask for PIN
                sessionData.selected_account = selectedAccount;
                sessionData.current_menu = 'fullstatement_pin';
                await ussdService.saveSession(session, sessionData);

                const message = 'Enter your PIN to view full statement:\n\n0. Back\n00. Home';
                return this.sendResponse(res, 'con', message);
            } else {
                return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
            }
        }

        // Handle PIN entry for full statement
        if (sessionData.current_menu === 'fullstatement_pin') {
            return await this.fullstatement_pin(customer, msisdn, session, shortcode, response, res);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    async fullstatement_pin(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::fullstatement_pin: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter your PIN to view full statement:\n\n0. Back\n00. Home';
            return this.sendResponse(res, 'con', message);
        }

        // Handle navigation options first
        if (response === '0' || response === '00') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Get full statement (you'll need to implement this in ussdService)
        const { charge, statementResponse } = await ussdService.handleFullStatement(
            customer,
            sessionData.selected_account,
            msisdn,
            session,
            shortcode
        );

        if (statementResponse.STATUS === '000') {
            let statementData = statementResponse.DATA || 'No transactions found';

            // Clean up statement display
            if (statementData.includes('Full Statement:')) {
                statementData = statementData.replace('Full Statement:', '').trim();
            }

            sessionData.current_menu = 'fullstatement_result';
            sessionData.statement_data = statementData;
            await ussdService.saveSession(session, sessionData);

            const message = `Account: ${sessionData.selected_account}\nFull Statement:\n${statementData}\n\n0. Back\n00. Home\n000. Exit`;
            return this.sendResponse(res, 'con', message);
        } else {
            const errorMsg = statementResponse.DATA || 'Unable to fetch full statement';
            return this.sendResponse(res, 'end', `Error: ${errorMsg}`);
        }
    }

    async fullstatement_result(customer, msisdn, session, shortcode, response, res) {
        logger.info(`USSDController::fullstatement_result: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            // Show statement again with navigation options
            const message = `Account: ${sessionData.selected_account}\nFull Statement:\n${sessionData.statement_data}\n\n0. Back\n00. Home`;
            return this.sendResponse(res, 'con', message);
        }

        return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
    }

    // Helper Methods
    async showAccountSelection(sessionData, session, res, nextMenu) {
        const accounts = sessionData.customer.accounts || [];
        let accountList = '';

        accounts.forEach((account, index) => {
            accountList += `${index + 1}. ${account}\n`;
        });

        sessionData.current_menu = nextMenu;
        await ussdService.saveSession(session, sessionData);

        const message = `Select account:\n${accountList}0. Back\n00. Exit`;
        return this.sendResponse(res, 'con', message);
    }

    displayMenu(menuKey, res, prefix = '') {
        const menu = this.menus[menuKey];
        if (!menu) {
            logger.error(`Menu not found: ${menuKey}`);
            return this.sendResponse(res, 'end', 'System error. Menu not found.');
        }

        let message = prefix + menu.message;

        if (prefix && prefix.includes('Confirm sending Ksh') && !prefix.includes('{amount}')) {
            message = prefix;
        } else if (menu.type === 'menu' && menu.options) {
            message += '\n';
            const desiredOrder = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00'];

            desiredOrder.forEach(key => {
                if (menu.options[key]) {
                    message += `${key}. ${menu.options[key]}\n`;
                }
            });

            // Remove the last newline character
            message = message.trim();
        }

        return this.sendResponse(res, menu.type === 'end' ? 'end' : 'con', message);
    }

    async handleNavigation(response, sessionData, msisdn, session, shortcode, res) {
        switch (response) {
            case '0':
                // Back to previous menu
                const previousMenu = sessionData.previous_menu || 'mobilebanking';
                sessionData.current_menu = previousMenu;
                // Clear transaction data when going back
                this.clearTransactionData(sessionData);
                await ussdService.saveSession(session, sessionData);
                return await this[previousMenu](sessionData.customer, msisdn, session, shortcode, null, res);

            case '00':
                // Exit - end session completely
                await ussdService.deleteSession(session);
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');

            default:
                return this.sendResponse(res, 'con', 'Invalid selection. Please try again.');
        }
    }

    clearTransactionData(sessionData) {
        delete sessionData.transaction_type;
        delete sessionData.amount;
        delete sessionData.mobile_number;
        delete sessionData.account_number;
        delete sessionData.selected_account;
        delete sessionData.remark;
        delete sessionData.bill_type;
        delete sessionData.bill_name;
        delete sessionData.merchant_code;
        delete sessionData.pin_stage;
        delete sessionData.old_pin;
        delete sessionData.new_pin;
        delete sessionData.balance;
        delete sessionData.recipient_mobile;
        delete sessionData.withdraw_type;
        delete sessionData.statement_data;
    }


    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8') + ' bytes';
        logger.info(`MENU{${type}}: ${message}`);
        logger.info(`MENU SIZE: ${messageSize}`);
        ussdService.logSessionTime();

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new USSDController();