const baseFeature = require('../baseFeature');

class InternalTransferFeature extends baseFeature {
    constructor() {
        super();
    }

    async internaltransfer(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'internaltransfer', 'fundstransfer');

            const accounts = customer.accounts || [];
            const hasMultipleAccounts = accounts.length > 1;

            const options = [
                { key: '1', name: 'To Own Account', method: 'internaltransferbankaccount', id: 'own', enabled: hasMultipleAccounts },
                { key: '2', name: 'To Other Account', method: 'internaltransferotheraccount', id: 'other', enabled: true },
                { key: '3', name: 'To a Saved Beneficiary', method: 'internaltransferbeneficiary', id: 'beneficiary', enabled: true },
                { key: '4', name: 'Manage Internal Transfer Beneficiaries', method: 'manageinternaltransferbeneficiary', id: 'managebeneficiary', enabled: true }
            ];

            let message = "Internal Transfer\n\n";
            options.forEach(option => {
                if (option.enabled) {
                    message += `${option.key}. ${option.name}\n`;
                } else {
                    message += `${option.key}. ${option.name} (Not available - single account)\n`;
                }
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

        const accounts = customer.accounts || [];
        const hasMultipleAccounts = accounts.length > 1;

        const options = {
            '1': { method: 'internaltransferbankaccount', id: 'own', enabled: hasMultipleAccounts },
            '2': { method: 'internaltransferotheraccount', id: 'other', enabled: true },
            '3': { method: 'internaltransferbeneficiary', id: 'beneficiary', enabled: true },
            '4': { method: 'manageinternaltransferbeneficiary', id: 'managebeneficiary', enabled: true }
        };

        const selected = options[response];
        if (!selected) {
            return this.displayMenu('internaltransfer', res, 'Invalid selection.\n\n');
        }

        // Check if option is enabled
        if (!selected.enabled) {
            return this.sendResponse(res, 'con', 'This option is not available when you have only one account.\n\n0. Back\n00. Exit');
        }

        // Store transfer type in session
        const sessionData = await this.ussdService.getSession(session);
        sessionData.transferType = selected.id;
        await this.ussdService.saveSession(session, sessionData);

        return await this[selected.method](customer, msisdn, session, shortcode, null, res);
    }

    async internaltransferbankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'internaltransferbankaccount', 'internaltransfer');
            return await this.showAccountSelection(
                sessionData, session, res, 'internaltransferbankaccount',
                "Select Source Account\n\n"
            );
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'internaltransfer',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const accounts = sessionData.customer.accounts || [];
        const accountIndex = parseInt(response) - 1;

        this.logger.info(`[INTERNALTRANSFER] User selected account index: ${accountIndex}, Available accounts: ${JSON.stringify(accounts)}`);

        if (accountIndex < 0 || accountIndex >= accounts.length) {
            return await this.showAccountSelection(sessionData, session, res,
                'internaltransferbankaccount', 'Invalid account selection.\n\nSelect Source Account\n\n');
        }

        const selectedAccount = accounts[accountIndex];
        sessionData.sourceAccount = selectedAccount;

        if (sessionData.transferType === 'own') {
            sessionData.ownTransferSourceKey = accountIndex;
            this.logger.info(`[INTERNALTRANSFER] Stored source account index: ${accountIndex} for account: ${selectedAccount}`);
        }

        await this.ussdService.saveSession(session, sessionData);

        // FIXED: Based on PHP logic - different flows for different transfer types
        if (sessionData.transferType === 'own') {
            return await this.internaltransferamount(customer, msisdn, session, shortcode, null, res);
        } else {
            return await this.internaltransferremark(customer, msisdn, session, shortcode, null, res);
        }
    }

    async internaltransferamount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        this.logger.info(`[INTERNALTRANSFER] internaltransferamount - Response: "${response}", Transfer Type: ${sessionData.transferType}`);

        if (!response) {
            await this.updateSessionMenu(session, 'internaltransferamount',
                sessionData.transferType === 'own' ? 'internaltransferbankaccount' : 'internaltransferotheraccount');

            return this.sendResponse(res, 'con', "Enter Amount\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            const backMethod = sessionData.transferType === 'own' ? 'internaltransferbankaccount' :
                sessionData.transferType === 'other' ? 'internaltransferotheraccount' :
                    'internaltransferbeneficiary';
            return await this.handleBack(sessionData, 'fundsTransfer', backMethod,
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', "Invalid amount. Please enter a valid number.\n\nEnter Amount\n\n0. Back\n00. Exit");
        }

        sessionData.transferAmount = response;
        await this.ussdService.saveSession(session, sessionData);

        this.logger.info(`[INTERNALTRANSFER] Amount set to: ${response}, proceeding to next step`);

        // FIXED: Based on PHP logic - different flows for different transfer types
        if (sessionData.transferType === 'own') {
            return await this.internaltransferownaccount(customer, msisdn, session, shortcode, null, res);
        } else {
            return await this.internaltransferbankaccount(customer, msisdn, session, shortcode, null, res);
        }
    }

    async internaltransferownaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        this.logger.info(`[INTERNALTRANSFER] internaltransferownaccount - Response: "${response}", Type: ${typeof response}`);

        if (!response) {
            await this.updateSessionMenu(session, 'internaltransferownaccount', 'internaltransferamount');

            // Get all accounts and exclude the source account
            const accounts = sessionData.customer.accounts || [];
            const sourceAccountIndex = sessionData.ownTransferSourceKey;

            // FIX: Check if sourceAccountIndex is defined
            if (sourceAccountIndex === undefined) {
                this.logger.error(`[INTERNALTRANSFER] ownTransferSourceKey is undefined, going back to amount`);
                return await this.handleBack(sessionData, 'fundsTransfer', 'internaltransferamount',
                    msisdn, session, shortcode, res);
            }

            // Filter out the source account
            const destinationAccounts = accounts.filter((account, index) => index !== sourceAccountIndex);

            this.logger.info(`[INTERNALTRANSFER] Filtering accounts - source index: ${sourceAccountIndex}, total accounts: ${accounts.length}, destination accounts: ${destinationAccounts.length}`);

            // Handle case where user has only one account
            if (destinationAccounts.length === 0) {
                const errorMessage = "You only have one account. Cannot transfer to own account when you have only one account.\n\n0. Back\n00. Exit";
                return this.sendResponse(res, 'con', errorMessage);
            }

            let accountList = "Select Destination Account\n\n";
            destinationAccounts.forEach((account, index) => {
                accountList += `${index + 1}. ${account}\n`;
            });
            accountList += "\n0. Back\n00. Exit";

            sessionData.destinationAccounts = destinationAccounts;
            await this.ussdService.saveSession(session, sessionData);

            this.logger.info(`[INTERNALTRANSFER] Showing ${destinationAccounts.length} destination accounts`);
            return this.sendResponse(res, 'con', accountList);
        }

        // ... rest of the method
    }

    async internaltransferremark(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'internaltransferremark',
                sessionData.transferType === 'own' ? 'internaltransferownaccount' : 'internaltransferbankaccount');

            return this.sendResponse(res, 'con', "Enter Remark\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            const backMethod = sessionData.transferType === 'own' ? 'internaltransferownaccount' : 'internaltransferbankaccount';
            return await this.handleBack(sessionData, 'fundsTransfer', backMethod,
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        sessionData.transferRemark = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.internaltransfertransaction(customer, msisdn, session, shortcode, null, res);
    }

    async internaltransfertransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'internaltransfertransaction', 'internaltransferremark');

            const amount = sessionData.transferAmount;
            const sourceAccount = sessionData.sourceAccount;
            const destinationAccount = sessionData.destinationAccount || sessionData.transferAccount;
            const remark = sessionData.transferRemark;

            // Validate session data exists
            if (!amount || !sourceAccount || !destinationAccount) {
                this.logger.error(`[INTERNALTRANSFER] Missing session data for transaction: amount=${amount}, source=${sourceAccount}, dest=${destinationAccount}`);
                return this.sendResponse(res, 'end', 'Session expired. Please start over.');
            }

            const message = `Enter PIN to transfer Ksh ${amount} to ${destinationAccount} from ${sourceAccount}. Remark: ${remark}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        // Handle back navigation
        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'internaltransferremark',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // FIX: Add proper PIN validation
        if (!this.ussdService.validatePIN(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN format. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.ussdService.handleInternalTransfer(
                customer,
                sessionData.sourceAccount,
                sessionData.destinationAccount || sessionData.transferAccount,
                sessionData.transferAmount,
                sessionData.transferRemark,
                response, // PIN
                msisdn, session, shortcode
            );

            this.logger.info(`[INTERNALTRANSFER] Transaction result: ${JSON.stringify(result)}`);

            // Handle response like PHP does - only clear on SUCCESS
            if (result.STATUS === '000' || result.STATUS === 'OK') {
                await this.clearTransferSession(session);
                const successMessage = result.DATA || `Transfer of Ksh ${sessionData.transferAmount} was successful.`;
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                // Don't clear session on failure - allow retry (PHP pattern)
                const errorMessage = result.DATA || 'Transfer failed. Please try again.';
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }
        } catch (error) {
            this.logger.error(`[INTERNALTRANSFER] Transaction error: ${error.message}`);
            const name = customer.firstname || customer.lastname || 'Customer';
            return this.sendResponse(res, 'con', `Dear ${name}, service temporarily unavailable. Please try again later.\n\n0. Back\n00. Exit`);
        }
    }

    async internaltransferotheraccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'internaltransferotheraccount', 'internaltransfer');
            return this.sendResponse(res, 'con', "Enter the Sidian Bank account number\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'internaltransfer',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!/^\d+$/.test(response)) {
            return this.sendResponse(res, 'con', "Invalid account number. Please enter numbers only.\n\nEnter the Sidian Bank account number\n\n0. Back\n00. Exit");
        }

        sessionData.transferAccount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.internaltransferamount(customer, msisdn, session, shortcode, null, res);
    }

    async internaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        // Implementation for beneficiary selection
        return this.sendResponse(res, 'con', "Beneficiary feature coming soon\n\n0. Back\n00. Exit");
    }

    async manageinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        // Implementation for beneficiary management
        return this.sendResponse(res, 'con', "Beneficiary management coming soon\n\n0. Back\n00. Exit");
    }

    // Add other beneficiary methods with similar stubs
    async addinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'con', "Add beneficiary coming soon\n\n0. Back\n00. Exit");
    }

    async addinternaltransferbeneficiaryname(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'con', "Add beneficiary name coming soon\n\n0. Back\n00. Exit");
    }

    async addinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'con', "Add beneficiary transaction coming soon\n\n0. Back\n00. Exit");
    }

    async viewinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'con', "View beneficiaries coming soon\n\n0. Back\n00. Exit");
    }

    async viewinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'con', "View beneficiary transaction coming soon\n\n0. Back\n00. Exit");
    }

    async deleteinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'con', "Delete beneficiary coming soon\n\n0. Back\n00. Exit");
    }

    async deleteinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'con', "Delete beneficiary transaction coming soon\n\n0. Back\n00. Exit");
    }

    async clearTransferSession(session) {
        try {
            const sessionData = await this.ussdService.getSession(session);
            if (sessionData) {
                delete sessionData.transferType;
                delete sessionData.sourceAccount;
                delete sessionData.destinationAccount;
                delete sessionData.transferAccount;
                delete sessionData.transferAmount;
                delete sessionData.transferRemark;
                delete sessionData.ownTransferSourceKey;
                delete sessionData.destinationAccounts;
                await this.ussdService.saveSession(session, sessionData);
            }
        } catch (error) {
            this.logger.error(`[INTERNALTRANSFER] Error clearing session: ${error.message}`);
        }
    }
}

// Create a single instance and export bound methods
const internalTransferInstance = new InternalTransferFeature();

module.exports = {
    internaltransfer: internalTransferInstance.internaltransfer.bind(internalTransferInstance),
    internaltransferbankaccount: internalTransferInstance.internaltransferbankaccount.bind(internalTransferInstance),
    internaltransferamount: internalTransferInstance.internaltransferamount.bind(internalTransferInstance),
    internaltransferownaccount: internalTransferInstance.internaltransferownaccount.bind(internalTransferInstance),
    internaltransferremark: internalTransferInstance.internaltransferremark.bind(internalTransferInstance),
    internaltransfertransaction: internalTransferInstance.internaltransfertransaction.bind(internalTransferInstance),
    internaltransferotheraccount: internalTransferInstance.internaltransferotheraccount.bind(internalTransferInstance),
    internaltransferbeneficiary: internalTransferInstance.internaltransferbeneficiary.bind(internalTransferInstance),
    manageinternaltransferbeneficiary: internalTransferInstance.manageinternaltransferbeneficiary.bind(internalTransferInstance),
    addinternaltransferbeneficiary: internalTransferInstance.addinternaltransferbeneficiary.bind(internalTransferInstance),
    addinternaltransferbeneficiaryname: internalTransferInstance.addinternaltransferbeneficiaryname.bind(internalTransferInstance),
    addinternaltransferbeneficiarytransaction: internalTransferInstance.addinternaltransferbeneficiarytransaction.bind(internalTransferInstance),
    viewinternaltransferbeneficiary: internalTransferInstance.viewinternaltransferbeneficiary.bind(internalTransferInstance),
    viewinternaltransferbeneficiarytransaction: internalTransferInstance.viewinternaltransferbeneficiarytransaction.bind(internalTransferInstance),
    deleteinternaltransferbeneficiary: internalTransferInstance.deleteinternaltransferbeneficiary.bind(internalTransferInstance),
    deleteinternaltransferbeneficiarytransaction: internalTransferInstance.deleteinternaltransferbeneficiarytransaction.bind(internalTransferInstance)
};