const baseFeature = require('../baseFeature');

class CardTransferFeature extends baseFeature {
    constructor() {
        super();
    }

    async cardtransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'cardtransaction', 'cardremark');

            const card = sessionData.cardtransfer || 'Card';
            const cardnumber = sessionData.cardnumber || '';
            const remark = sessionData.cardremark || '';
            const amount = sessionData.cardamount || '';
            const bankaccountid = sessionData.cardbankaccount || '';

            // FIX: Get charges like PHP does
            const charges = await this.getTransactionCharges(customer, msisdn, session, shortcode, 'PAYCARD', amount);

            const message = `Enter PIN to transfer Ksh ${amount} to ${card} ${cardnumber} from account ${bankaccountid}. Remark: ${remark}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        // FIX: Check if transaction already processed like PHP
        if (sessionData.cardtransaction) {
            if (response === '00') {
                return await this.handleExit(session, res);
            } else {
                return await this.handleBackToHome(customer, msisdn, session, shortcode, res);
            }
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'cardremark',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // FIX: Use the enhanced PIN validation from baseFeature
        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.ussdService.handleCardTransfer(
                customer,
                sessionData.cardtransferid, // Use the ID (PREPAID/CREDIT)
                sessionData.cardnumber,
                sessionData.cardamount,
                sessionData.cardbankaccount,
                sessionData.cardremark,
                response, // PIN
                msisdn, session, shortcode
            );

            // Mark transaction as processed like PHP
            sessionData.cardtransaction = true;
            await this.ussdService.saveSession(session, sessionData);

            // FIX: Use proper response parsing
            if (result.STATUS === '000' || result.STATUS === 'OK') {
                const successMessage = result.DATA || 'Card transfer completed successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Card transfer failed. Please try again.';
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }
        } catch (error) {
            // FIX: Better error handling
            this.logger.error(`[CARDTRANSFER] Transaction error: ${error.message}`);
            const name = customer.firstname || customer.lastname || 'Customer';
            return this.sendResponse(res, 'con', `Dear ${name}, sorry the service is temporarily unavailable. Please try again later\n\n0. Back\n00. Exit`);
        }
    }
    // Add this missing method to your CardTransferFeature class in cardTransfer.js
async cardtransfer(customer, msisdn, session, shortcode, response, res) {
    if (!response) {
        await this.updateSessionMenu(session, 'cardtransfer', 'fundstransfer');
        
        // FIX: Use exact PHP options format
        const options = [
            ['Pre-Paid Card', 'PREPAID'],
            ['Credit Card', 'CREDIT']
        ];

        let message = "Card Transfer\n\nSelect Card Type:\n";
        options.forEach((option, index) => {
            const [name, id] = option;
            message += `${index + 1}. ${name}\n`;
        });
        message += "\n0. Back\n00. Exit";

        return this.sendResponse(res, 'con', message);
    }

    if (response === '0') {
        return await this.handleBack(
            await this.ussdService.getSession(session),
            'fundsTransfer', 'fundstransfer', msisdn, session, shortcode, res
        );
    }

    if (response === '00') {
        return await this.handleExit(session, res);
    }

    // FIX: Use PHP validation logic
    if (!/^\d+$/.test(response)) {
        return this.displayMenu('cardtransfer', res, 'Invalid selection.\n\n');
    }

    const key = parseInt(response) - 1;
    const options = [
        ['Pre-Paid Card', 'PREPAID'],
        ['Credit Card', 'CREDIT']
    ];

    if (key < 0 || key >= options.length) {
        return this.displayMenu('cardtransfer', res, 'Invalid selection.\n\n');
    }

    const [name, id] = options[key];
    
    // Store like PHP does
    const sessionData = await this.ussdService.getSession(session);
    sessionData.cardtransfer = name;
    sessionData.cardtransferid = id;
    await this.ussdService.saveSession(session, sessionData);

    return await this.cardnumber(customer, msisdn, session, shortcode, null, res);
}

    async cardnumber(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'cardnumber', 'cardtransfer');

            const card = sessionData.cardtransfer || 'Card';
            return this.sendResponse(res, 'con', `Enter the ${card} number\n\n0. Back\n00. Exit`);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'cardtransfer',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // FIX: Use PHP validation - ctype_digit equivalent
        if (!/^\d+$/.test(response)) {
            return this.sendResponse(res, 'con', "Invalid card number. Please enter numbers only:\n\n0. Back\n00. Exit");
        }

        sessionData.cardnumber = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.cardamount(customer, msisdn, session, shortcode, null, res);
    }

    async cardamount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'cardamount', 'cardnumber');
            return this.sendResponse(res, 'con', "Enter Amount\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'cardnumber',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // FIX: Use PHP validation - ctype_digit equivalent
        if (!/^\d+$/.test(response)) {
            return this.sendResponse(res, 'con', "Invalid amount. Please enter numbers only:\n\n0. Back\n00. Exit");
        }

        sessionData.cardamount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.cardbankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async cardbankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'cardbankaccount', 'cardamount');

            const accounts = customer.accounts || [];
            let message = "Select Source Account\n\n";
            accounts.forEach((account, index) => {
                message += `${index + 1}. ${account}\n`;
            });
            message += "\n0. Back\n00. Exit";

            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'cardamount',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!/^\d+$/.test(response)) {
            return this.sendResponse(res, 'con', 'Invalid account selection.\n\n0. Back\n00. Exit');
        }

        const accounts = customer.accounts || [];
        const key = parseInt(response) - 1;

        if (key < 0 || key >= accounts.length) {
            return this.sendResponse(res, 'con', 'Invalid account selection.\n\n0. Back\n00. Exit');
        }

        sessionData.cardbankaccount = accounts[key];
        await this.ussdService.saveSession(session, sessionData);

        return await this.cardremark(customer, msisdn, session, shortcode, null, res);
    }

    async cardremark(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'cardremark', 'cardbankaccount');
            return this.sendResponse(res, 'con', "Enter Remark\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'cardbankaccount',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        sessionData.cardremark = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.cardtransaction(customer, msisdn, session, shortcode, null, res);
    }

    async cardtransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'cardtransaction', 'cardremark');

            const card = sessionData.cardtransfer || 'Card';
            const cardnumber = sessionData.cardnumber || '';
            const remark = sessionData.cardremark || '';
            const amount = sessionData.cardamount || '';
            const bankaccountid = sessionData.cardbankaccount || '';

            // FIX: Get charges like PHP does
            const charges = await this.getTransactionCharges(customer, msisdn, session, shortcode, 'PAYCARD', amount);

            const message = `Enter PIN to transfer Ksh ${amount} to ${card} ${cardnumber} from account ${bankaccountid}. Remark: ${remark}\n${charges}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        // FIX: Check if transaction already processed like PHP
        if (sessionData.cardtransaction) {
            if (response === '00') {
                return await this.handleExit(session, res);
            } else {
                return await this.handleBackToHome(customer, msisdn, session, shortcode, res);
            }
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'cardremark',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.ussdService.handleCardTransfer(
                customer,
                sessionData.cardtransferid, // Use the ID (PREPAID/CREDIT)
                sessionData.cardnumber,
                sessionData.cardamount,
                sessionData.cardbankaccount,
                sessionData.cardremark,
                response,
                msisdn, session, shortcode
            );

            // Mark transaction as processed like PHP
            sessionData.cardtransaction = true;
            await this.ussdService.saveSession(session, sessionData);

            if (result.STATUS === '000') {
                const successMessage = result.DATA || 'Card transfer completed successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Card transfer failed. Please try again.';
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }
        } catch (error) {
            this.logger.error(`[CARDTRANSFER] Transaction error: ${error.message}`);
            const name = customer.firstname || customer.lastname || 'Customer';
            return this.sendResponse(res, 'con', `Dear ${name}, sorry the service is temporarily unavailable. Please try again later\n\n0. Back\n00. Exit`);
        }
    }

    async getTransactionCharges(customer, msisdn, session, shortcode, merchantid, amount) {
        try {
            const response = await this.ussdService.getAirtimeCharges(customer, merchantid, amount, msisdn, session, shortcode);
            if (response.STATUS === '000' || response.STATUS === 'OK') {
                const charge = this.ussdService.parseAirtimeCharges(response);
                return `Charge: Ksh ${charge}`;
            }
        } catch (error) {
            this.logger.error(`[CARDTRANSFER] Get charges error: ${error.message}`);
        }
        return 'Charge: Ksh 0';
    }
}

// Create instance and export methods
const cardTransferInstance = new CardTransferFeature();

module.exports = {
    cardtransfer: cardTransferInstance.cardtransfer.bind(cardTransferInstance),
    cardnumber: cardTransferInstance.cardnumber.bind(cardTransferInstance),
    cardamount: cardTransferInstance.cardamount.bind(cardTransferInstance),
    cardbankaccount: cardTransferInstance.cardbankaccount.bind(cardTransferInstance),
    cardremark: cardTransferInstance.cardremark.bind(cardTransferInstance),
    cardtransaction: cardTransferInstance.cardtransaction.bind(cardTransferInstance)
};