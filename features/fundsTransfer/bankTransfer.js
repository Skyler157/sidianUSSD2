const baseFeature = require('../baseFeature');

class BankTransferFeature extends baseFeature {
    constructor() {
        super();
    }

    async banktransfer(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'banktransfer', 'fundstransfer');
            const options = [
                { key: '1', name: 'EFT Transfer', method: 'bankfilter', id: 'EFT' },
                { key: '2', name: 'RTGS Transfer', method: 'bankfilter', id: 'RTGS' }
            ];

            let message = "Bank Transfer\n\nSelect Transfer Type:\n";
            options.forEach(option => {
                message += `${option.key}. ${option.name}\n`;
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

        const options = {
            '1': { method: 'bankfilter', id: 'EFT' },
            '2': { method: 'bankfilter', id: 'RTGS' }
        };

        const selected = options[response];
        if (!selected) {
            return this.displayMenu('banktransfer', res, 'Invalid selection.\n\n');
        }

        const sessionData = await this.ussdService.getSession(session);
        sessionData.transferType = selected.id;
        await this.ussdService.saveSession(session, sessionData);

        return await this.bankfilter(customer, msisdn, session, shortcode, null, res);
    }

    async bankfilter(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'bankfilter', 'banktransfer');
            return this.sendResponse(res, 'con', "Enter Bank Name (or part of name):\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'banktransfer',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        sessionData.bankFilter = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.banklist(customer, msisdn, session, shortcode, null, res);
    }

    async banklist(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'banklist', 'bankfilter');

            try {
                const result = await this.ussdService.getBankList(
                    customer,
                    sessionData.bankFilter,
                    msisdn, session, shortcode
                );

                if (result.STATUS === '000' && result.DATA) {
                    const banks = this.parseBankList(result.DATA);
                    if (banks.length > 0) {
                        sessionData.banks = banks;
                        await this.ussdService.saveSession(session, sessionData);

                        let message = "Select Bank:\n\n";
                        banks.forEach((bank, index) => {
                            message += `${index + 1}. ${bank.name}\n`;
                        });
                        message += "\n0. Back\n00. Exit";

                        return this.sendResponse(res, 'con', message);
                    }
                }

                return this.sendResponse(res, 'con', "No banks found. Please try a different search:\n\n0. Back\n00. Exit");
            } catch (error) {
                this.logger.error(`[BANKTRANSFER] Bank list error: ${error.message}`);
                return this.sendResponse(res, 'con', "Service temporarily unavailable. Please try again:\n\n0. Back\n00. Exit");
            }
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'bankfilter',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const bankIndex = parseInt(response) - 1;
        const banks = sessionData.banks || [];

        if (bankIndex < 0 || bankIndex >= banks.length) {
            return this.sendResponse(res, 'con', "Invalid bank selection.\n\n0. Back\n00. Exit");
        }

        sessionData.selectedBank = banks[bankIndex];
        await this.ussdService.saveSession(session, sessionData);

        return await this.bankbranch(customer, msisdn, session, shortcode, null, res);
    }

    async bankbranch(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'bankbranch', 'banklist');
            return this.sendResponse(res, 'con', "Enter Branch Name (or part of name):\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'banklist',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        sessionData.branchFilter = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.bankbranchlist(customer, msisdn, session, shortcode, null, res);
    }

    async bankbranchlist(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'bankbranchlist', 'bankbranch');

            try {
                const result = await this.ussdService.getBranchList(
                    customer,
                    sessionData.selectedBank.code,
                    sessionData.branchFilter,
                    msisdn, session, shortcode
                );

                if (result.STATUS === '000' && result.DATA) {
                    const branches = this.parseBranchList(result.DATA);
                    if (branches.length > 0) {
                        sessionData.branches = branches;
                        await this.ussdService.saveSession(session, sessionData);

                        let message = "Select Branch:\n\n";
                        branches.forEach((branch, index) => {
                            message += `${index + 1}. ${branch.name}\n`;
                        });
                        message += "\n0. Back\n00. Exit";

                        return this.sendResponse(res, 'con', message);
                    }
                }

                return this.sendResponse(res, 'con', "No branches found. Please try a different search:\n\n0. Back\n00. Exit");
            } catch (error) {
                this.logger.error(`[BANKTRANSFER] Branch list error: ${error.message}`);
                return this.sendResponse(res, 'con', "Service temporarily unavailable. Please try again:\n\n0. Back\n00. Exit");
            }
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'bankbranch',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const branchIndex = parseInt(response) - 1;
        const branches = sessionData.branches || [];

        if (branchIndex < 0 || branchIndex >= branches.length) {
            return this.sendResponse(res, 'con', "Invalid branch selection.\n\n0. Back\n00. Exit");
        }

        sessionData.selectedBranch = branches[branchIndex];
        await this.ussdService.saveSession(session, sessionData);

        return await this.banktrasferaccount(customer, msisdn, session, shortcode, null, res);
    }

    async banktrasferaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'banktrasferaccount', 'bankbranchlist');
            return this.sendResponse(res, 'con', "Enter Destination Account Number:\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'bankbranchlist',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!/^\d+$/.test(response)) {
            return this.sendResponse(res, 'con', "Invalid account number. Please enter numbers only:\n\n0. Back\n00. Exit");
        }

        sessionData.destinationAccount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.banktrasfername(customer, msisdn, session, shortcode, null, res);
    }

    async banktrasfername(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'banktrasfername', 'banktrasferaccount');
            return this.sendResponse(res, 'con', "Enter Account Holder Name:\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'banktrasferaccount',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response.length < 2) {
            return this.sendResponse(res, 'con', "Invalid name. Please enter proper account holder name:\n\n0. Back\n00. Exit");
        }

        sessionData.accountName = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.banktrasfermount(customer, msisdn, session, shortcode, null, res);
    }

    async banktrasfermount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'banktrasfermount', 'banktrasfername');
            return this.sendResponse(res, 'con', "Enter Amount:\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'banktrasfername',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validateAmount(response)) {
            return this.sendResponse(res, 'con', "Invalid amount. Please enter a valid number:\n\n0. Back\n00. Exit");
        }

        sessionData.transferAmount = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.banktrasferbankaccount(customer, msisdn, session, shortcode, null, res);
    }

    async banktrasferbankaccount(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'banktrasferbankaccount', 'banktrasfermount');
            return await this.showAccountSelection(
                sessionData, session, res, 'banktrasferbankaccount',
                "Select Source Account\n\n"
            );
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'banktrasfermount',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        const accounts = sessionData.customer.accounts || [];
        const accountIndex = parseInt(response) - 1;

        if (accountIndex < 0 || accountIndex >= accounts.length) {
            return await this.showAccountSelection(sessionData, session, res,
                'banktrasferbankaccount', 'Invalid account selection.\n\nSelect Source Account\n\n');
        }

        sessionData.sourceAccount = accounts[accountIndex];
        await this.ussdService.saveSession(session, sessionData);

        return await this.banktrasferremark(customer, msisdn, session, shortcode, null, res);
    }

    async banktrasferremark(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'banktrasferremark', 'banktrasferbankaccount');
            return this.sendResponse(res, 'con', "Enter Remark:\n\n0. Back\n00. Exit");
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'banktrasferbankaccount',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        sessionData.transferRemark = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.banktrasfertransaction(customer, msisdn, session, shortcode, null, res);
    }

    async banktrasfertransaction(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'banktrasfertransaction', 'banktrasferremark');

            const amount = sessionData.transferAmount;
            const sourceAccount = sessionData.sourceAccount;
            const destinationAccount = sessionData.destinationAccount;
            const bankName = sessionData.selectedBank.name;
            const branchName = sessionData.selectedBranch.name;
            const accountName = sessionData.accountName;
            const remark = sessionData.transferRemark;

            const message = `Enter PIN to transfer Ksh ${amount} to ${accountName} (${destinationAccount}) at ${bankName} ${branchName} from ${sourceAccount}. Remark: ${remark}\n\n0. Back\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'fundsTransfer', 'banktrasferremark',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (!this.validatePin(response)) {
            return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:\n\n0. Back\n00. Exit');
        }

        try {
            const result = await this.ussdService.handleBankTransfer(
                customer,
                sessionData.transferType,
                sessionData.selectedBank.code,
                sessionData.selectedBranch.code,
                sessionData.destinationAccount,
                sessionData.accountName,
                sessionData.transferAmount,
                sessionData.sourceAccount,
                sessionData.transferRemark,
                response,
                msisdn, session, shortcode
            );

            await this.clearBankSession(session);

            if (result.STATUS === '000' || result.STATUS === 'OK') {
                const successMessage = result.DATA || 'Bank transfer completed successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Bank transfer failed. Please try again.';
                return this.sendResponse(res, 'end', errorMessage);
            }
        } catch (error) {
            this.logger.error(`[BANKTRANSFER] Transaction error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    parseBankList(data) {
        try {
            const banks = [];
            const items = data.split(';');

            for (const item of items) {
                if (item.trim()) {
                    const parts = item.split(',');
                    if (parts.length >= 2) {
                        banks.push({
                            code: parts[0].trim(),
                            name: parts[1].trim()
                        });
                    }
                }
            }
            return banks;
        } catch (error) {
            this.logger.error(`[BANKTRANSFER] Error parsing bank list: ${error.message}`);
            return [];
        }
    }

    parseBranchList(data) {
        try {
            const branches = [];
            const items = data.split(';');

            for (const item of items) {
                if (item.trim()) {
                    const parts = item.split(',');
                    if (parts.length >= 2) {
                        branches.push({
                            code: parts[0].trim(),
                            name: parts[1].trim()
                        });
                    }
                }
            }
            return branches;
        } catch (error) {
            this.logger.error(`[BANKTRANSFER] Error parsing branch list: ${error.message}`);
            return [];
        }
    }

    async clearBankSession(session) {
        try {
            const sessionData = await this.ussdService.getSession(session);
            if (sessionData) {
                delete sessionData.transferType;
                delete sessionData.bankFilter;
                delete sessionData.banks;
                delete sessionData.selectedBank;
                delete sessionData.branchFilter;
                delete sessionData.branches;
                delete sessionData.selectedBranch;
                delete sessionData.destinationAccount;
                delete sessionData.accountName;
                delete sessionData.sourceAccount;
                delete sessionData.transferAmount;
                delete sessionData.transferRemark;
                await this.ussdService.saveSession(session, sessionData);
            }
        } catch (error) {
            this.logger.error(`[BANKTRANSFER] Error clearing session: ${error.message}`);
        }
    }
}

const bankTransferInstance = new BankTransferFeature();

module.exports = {
    banktransfer: bankTransferInstance.banktransfer.bind(bankTransferInstance),
    bankfilter: bankTransferInstance.bankfilter.bind(bankTransferInstance),
    banklist: bankTransferInstance.banklist.bind(bankTransferInstance),
    bankbranch: bankTransferInstance.bankbranch.bind(bankTransferInstance),
    bankbranchlist: bankTransferInstance.bankbranchlist.bind(bankTransferInstance),
    banktrasferaccount: bankTransferInstance.banktrasferaccount.bind(bankTransferInstance),
    banktrasfername: bankTransferInstance.banktrasfername.bind(bankTransferInstance),
    banktrasfermount: bankTransferInstance.banktrasfermount.bind(bankTransferInstance),
    banktrasferbankaccount: bankTransferInstance.banktrasferbankaccount.bind(bankTransferInstance),
    banktrasferremark: bankTransferInstance.banktrasferremark.bind(bankTransferInstance),
    banktrasfertransaction: bankTransferInstance.banktrasfertransaction.bind(bankTransferInstance)
};