const ussdService = require('../services/ussdService');
const logger = require('../services/logger');
const apiService = require('../services/apiService');
const baseFeature = require('./baseFeature');

class BillPaymentFeature extends baseFeature { 
    constructor() {
        super();
        this.menus = require('../config/menus.json');
        this.billProviders = {
            '1': { name: 'DStv', code: 'DSTV', merchantId: '007001001', method: 'billmeter' },
            '2': { name: 'GOtv', code: 'GOTV', merchantId: '007001014', method: 'billmeter' },
            '3': { name: 'Zuku', code: 'ZUKU', merchantId: 'ZUKU', method: 'zuku' },
            '4': { name: 'StarTimes', code: 'STARTIMES', merchantId: '007001015', method: 'billmeter' },
            '5': { name: 'Nairobi Water', code: 'NAIROBIWATER', merchantId: '007001003', method: 'billmeter' },
            '6': { name: 'JTL', code: 'JTL', merchantId: '007001013', method: 'billmeter' }
        };

        this.zukuServices = {
            '1': { name: 'Zuku Satellite', code: 'ZUKUSATELLITE', merchantId: 'ZUKUSATELLITE' },
            '2': { name: 'Zuku Tripple Play', code: 'ZUKUTRIPLEPLAY', merchantId: 'ZUKUTRIPLEPLAY' }
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
            return this.sendResponse(res, 'con', 'Invalid bill provider. Please try again:\n\n0. Back\n00. Exit');
        }

        sessionData.bill_type = billType;
        sessionData.bill_name = provider.name;
        sessionData.bill_code = provider.code;
        sessionData.bill_merchant_id = provider.merchantId;
        sessionData.bill_method = provider.method;
        sessionData.current_menu = 'billmeter';
        sessionData.previous_menu = 'billpayment';

        await ussdService.saveSession(session, sessionData);

        if (provider.method === 'billmeter') {
            return this.billmeter(customer, msisdn, session, shortcode, null, res);
        }

        return this.sendResponse(res, 'con', 'Invalid bill method');
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
            '1': () => this.processZukuService(customer, msisdn, session, shortcode, '1', res),
            '2': () => this.processZukuService(customer, msisdn, session, shortcode, '2', res),
            '0': () => this.handleNavigation('0', sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleNavigation('00', sessionData, msisdn, session, shortcode, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'zuku');
    }

    async processZukuService(customer, msisdn, session, shortcode, serviceType, res) {
        const sessionData = await ussdService.getSession(session);
        const service = this.zukuServices[serviceType];

        if (!service) {
            return this.sendResponse(res, 'con', 'Invalid Zuku service. Please try again:\n\n0. Back\n00. Exit');
        }

        sessionData.bill_name = service.name;
        sessionData.bill_code = service.code;
        sessionData.bill_merchant_id = service.merchantId;
        sessionData.bill_method = 'billmeter';
        sessionData.current_menu = 'billmeter';
        sessionData.previous_menu = 'zuku';

        await ussdService.saveSession(session, sessionData);
        return this.billmeter(customer, msisdn, session, shortcode, null, res);
    }

    async billmeter(customer, msisdn, session, shortcode, response, res) {
        logger.info(`BillPayment::billmeter: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            delete sessionData.bill_meter_true;
            delete sessionData.bill_meter_false;
            delete sessionData.bill_meter_menu;

            sessionData.current_menu = 'billmeter';
            await ussdService.saveSession(session, sessionData);

            const billName = sessionData.bill_name || 'Bill';
            const message = `Enter the ${billName} account number:\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return this.handleBackNavigation(sessionData, msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return this.handleExit(res);
        }

        if (sessionData.bill_meter_true) {
            return this.handleBillMeterConfirmation(customer, msisdn, session, shortcode, response, res);
        }

        const billCode = sessionData.bill_code;
        const skipValidation = ['STARTIMES', 'JTL'].includes(billCode);

        if (skipValidation) {
            sessionData.bill_meter_account = response;
            sessionData.current_menu = 'billamount';
            await ussdService.saveSession(session, sessionData);
            return this.billamount(customer, msisdn, session, shortcode, null, res);
        }

        return await this.validateBillAccount(customer, msisdn, session, shortcode, response, res);
    }

    async validateBillAccount(customer, msisdn, session, shortcode, accountNumber, res) {
        const sessionData = await ussdService.getSession(session);
        const merchantId = sessionData.bill_merchant_id;
        const billCode = sessionData.bill_code;
        const billName = sessionData.bill_name;

        try {
            const data = `MERCHANTID:${merchantId}:ACCOUNTID:${accountNumber}:INFOFIELD1:${billCode}:ACTION:GETNAME:CUSTOMERID:${customer.customerid}`;

            const validate = await apiService.makeRequest(
                "M-",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`BillPayment::validateBillAccount Response: ${JSON.stringify(validate)}`);

            if (validate.STATUS !== '000' && validate.STATUS !== 'OK') {
                const errorMessage = validate.DATA || `Dear ${customer.firstname || 'Customer'}, sorry the service is temporarily unavailable. Please try again later`;
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }

            // Store validated account
            sessionData.bill_meter_account = accountNumber;
            sessionData.bill_meter_true = true;

            let confirmationMessage = `Confirm the ${billName} account\n\n`;

            if (validate.DATA) {
                const details = validate.DATA.split('|').filter(item => item.trim());
                if (details.length > 1) {
                    const pairs = {};
                    for (let i = 0; i < details.length; i += 2) {
                        if (details[i] && details[i + 1]) {
                            pairs[details[i]] = details[i + 1];
                        }
                    }

                    for (const [key, value] of Object.entries(pairs)) {
                        confirmationMessage += `${key}: ${value}\n`;
                    }
                } else {
                    confirmationMessage += validate.DATA;
                }
            } else {
                confirmationMessage += `Account: ${accountNumber}`;
            }

            confirmationMessage += '\n1. Confirm\n2. Cancel';

            const menu = {
                name: 'billmeter',
                action: 'con',
                message: confirmationMessage
            };

            sessionData.bill_meter_menu = menu;
            await ussdService.saveSession(session, sessionData);

            return this.sendResponse(res, 'con', confirmationMessage);

        } catch (error) {
            logger.error(`BillPayment::validateBillAccount Error: ${error.message}`);
            const errorMessage = `Dear ${customer.firstname || 'Customer'}, sorry the service is temporarily unavailable. Please try again later`;
            return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
        }
    }

    async processBillTransaction(customer, msisdn, session, shortcode, pin, res) {
        const sessionData = await ussdService.getSession(session);

        const meterAccount = sessionData.bill_meter_account;
        const amount = sessionData.bill_amount;
        const billCode = sessionData.bill_code;
        const merchantId = sessionData.bill_merchant_id;
        const bankAccount = sessionData.bill_bank_account;

        try {
            const data = `MERCHANTID:${merchantId}:BANKACCOUNTID:${bankAccount}:ACCOUNTID:${meterAccount}:AMOUNT:${amount}:CUSTOMERID:${customer.customerid}:INFOFIELD2:${billCode}:INFOFIELD9:${msisdn}:ACTION:PAYBILL:TMPIN:${pin}`;

            const transaction = await apiService.makeRequest(
                "M-",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`BillPayment::processBillTransaction Response: ${JSON.stringify(transaction)}`);

            // Mark transaction as completed
            sessionData.bill_transaction_completed = true;
            await ussdService.saveSession(session, sessionData);

            let message;
            if (transaction.STATUS === '000' || transaction.STATUS === 'OK') {
                message = transaction.DATA || `Payment of Ksh ${amount} to ${sessionData.bill_name} was successful`;
            } else {
                message = transaction.DATA || `Dear ${customer.firstname || 'Customer'}, sorry the service is temporarily unavailable. Please try again later`;
            }

            const finalMessage = `${message}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', finalMessage);

        } catch (error) {
            logger.error(`BillPayment::processBillTransaction Error: ${error.message}`);
            const errorMessage = `Dear ${customer.firstname || 'Customer'}, sorry the service is temporarily unavailable. Please try again later`;
            return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
        }
    }

    async handleBillMeterConfirmation(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        switch (response) {
            case '1': // Confirm
                sessionData.current_menu = 'billamount';
                await ussdService.saveSession(session, sessionData);
                return this.billamount(customer, msisdn, session, shortcode, null, res);

            case '2': // Cancel
                return this.billpayment(customer, msisdn, session, shortcode, null, res);

            default:
                const menu = sessionData.bill_meter_menu || { message: 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel' };
                return this.sendResponse(res, 'con', menu.message);
        }
    }

    async billamount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`BillPayment::billamount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'billamount';
            await ussdService.saveSession(session, sessionData);
            return this.sendResponse(res, 'con', 'Enter Amount:\n\n0. Back\n00. Exit');
        }

        if (response === '0') {
            sessionData.current_menu = 'billmeter';
            await ussdService.saveSession(session, sessionData);
            return this.billmeter(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return this.handleExit(res);
        }

        // Validate amount
        if (!/^\d+$/.test(response)) {
            return this.sendResponse(res, 'con', 'Invalid amount. Please enter numbers only:\n\n0. Back\n00. Exit');
        }

        const amount = parseInt(response);
        if (amount <= 0) {
            return this.sendResponse(res, 'con', 'Amount must be greater than 0:\n\n0. Back\n00. Exit');
        }

        sessionData.bill_amount = amount;
        sessionData.current_menu = 'billbankaccount';
        await ussdService.saveSession(session, sessionData);

        return this.billbankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async billbankaccount(customer, msisdn, session, shortcode, response, res) {
        logger.info(`BillPayment::billbankaccount: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'billbankaccount';
            await ussdService.saveSession(session, sessionData);

            // Display account selection
            const accounts = customer.accounts || [];
            let message = 'Select source account:\n';

            accounts.forEach((account, index) => {
                message += `${index + 1}. ${account}\n`;
            });

            message += '\n0. Back\n00. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            sessionData.current_menu = 'billamount';
            await ussdService.saveSession(session, sessionData);
            return this.billamount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return this.handleExit(res);
        }

        // Validate account selection
        const accounts = customer.accounts || [];
        const accountIndex = parseInt(response) - 1;

        if (isNaN(accountIndex) || accountIndex < 0 || accountIndex >= accounts.length) {
            return this.sendResponse(res, 'con', 'Invalid account selection. Please try again:\n\n0. Back\n00. Exit');
        }

        const selectedAccount = accounts[accountIndex];
        sessionData.bill_bank_account = selectedAccount;
        sessionData.current_menu = 'billtransaction';
        await ussdService.saveSession(session, sessionData);

        return this.billtransaction(customer, msisdn, session, shortcode, null, res);
    }

    async billtransaction(customer, msisdn, session, shortcode, response, res) {
        logger.info(`BillPayment::billtransaction: ${JSON.stringify({ customer, msisdn, session, shortcode, response })}`);

        const sessionData = await ussdService.getSession(session);

        if (!response) {

            delete sessionData.bill_transaction_completed;

            sessionData.current_menu = 'billtransaction';
            await ussdService.saveSession(session, sessionData);

            const billName = sessionData.bill_name;
            const meterAccount = sessionData.bill_meter_account;
            const amount = sessionData.bill_amount;
            const bankAccount = sessionData.bill_bank_account;

            const charges = await this.getBillCharges(customer, msisdn, session, shortcode, sessionData.bill_merchant_id, amount);

            const message = `Enter PIN to pay Ksh ${amount} to ${billName} for ${meterAccount} from account ${bankAccount}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (sessionData.bill_transaction_completed) {
            if (response === '00') {
                return this.handleExit(res);
            } else {
                return this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
            }
        }

        if (response === '0') {
            sessionData.current_menu = 'billbankaccount';
            await ussdService.saveSession(session, sessionData);
            return this.billbankaccount(customer, msisdn, session, shortcode, null, res);
        }

        if (response === '00') {
            return this.handleExit(res);
        }


        return await this.processBillTransaction(customer, msisdn, session, shortcode, response, res);
    }

    async getBillCharges(customer, msisdn, session, shortcode, merchantId, amount) {
        logger.info(`[BILLPAYMENT] Skipping charges for merchant: ${merchantId}, amount: ${amount}`);
        return '';
    }


    async handleBackNavigation(sessionData, msisdn, session, shortcode, res) {
        const previousMenu = sessionData.previous_menu;

        logger.info(`[BILLPAYMENT] Handling back navigation to: ${previousMenu}`);

        const featureManager = require('./index');

        switch (previousMenu) {
            case 'zuku':
                return await featureManager.execute('billPayment', 'zuku', sessionData.customer, msisdn, session, shortcode, null, res);
            case 'billpayment':
            default:
                return await featureManager.execute('billPayment', 'billpayment', sessionData.customer, msisdn, session, shortcode, null, res);
        }
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
            return await this.handleBack(sessionData,
                this.getBackFeature(sessionData.current_menu),
                this.getBackMethod(sessionData.current_menu),
                msisdn, session, shortcode, res);
        } else if (response === '00') {
            return this.handleExit(session, res); 
        }
        return this.sendResponse(res, 'con', 'Invalid navigation option');
    }
}

module.exports = new BillPaymentFeature();