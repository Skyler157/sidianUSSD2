const baseFeature = require('./baseFeature');

class BeneficiaryService extends baseFeature {
    constructor() {
        super();
    }

    async beneficiary(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'beneficiary', 'myaccount');
            return this.displayMenu('beneficiary', res); // This shows "1. M-PESA"
        }

        const menuHandlers = {
            '1': () => this.managewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res) // Pass null as response to show menu
        };

        return await this.handleMenuFlow('beneficiary', response, menuHandlers,
            await this.ussdService.getSession(session), msisdn, session, shortcode, res);
    }

    async managewithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        // If no response, show the M-PESA beneficiary management menu
        if (!response) {
            await this.updateSessionMenu(session, 'managewithdrawbeneficiary', 'beneficiary');
            return this.displayMenu('managewithdrawbeneficiary', res);
        }

        // Handle menu selections
        if (response === '0') {
            return await this.handleBack(sessionData, 'beneficiaryService', 'beneficiary',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Define menu handlers with proper menu names
        const menuHandlers = {
            '1': {
                method: () => this.addwithdrawbeneficiary(customer, msisdn, session, shortcode, null, res),
                menu: 'addwithdrawbeneficiary'
            },
            '2': {
                method: () => this.viewwithdrawbeneficiaries(customer, msisdn, session, shortcode, null, res),
                menu: 'viewwithdrawbeneficiaries'
            },
            '3': {
                method: () => this.deletewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res),
                menu: 'deletewithdrawbeneficiary'
            }
        };

        // Check if it's a valid menu option
        if (menuHandlers[response]) {
            // Update session menu to the correct menu name
            await this.updateSessionMenu(session, menuHandlers[response].menu, 'managewithdrawbeneficiary');
            return await menuHandlers[response].method();
        } else {
            // Invalid option, show menu again
            return this.displayMenu('managewithdrawbeneficiary', res, 'Invalid selection. Please try again:\n\n');
        }
    }

    async addwithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'addwithdrawbeneficiary', 'managewithdrawbeneficiary');
            // Add back/exit options to input screens
            const message = "Enter the M-PESA mobile number\n\nFormat: 07_ or 01_\n\n0. Back\n00. Exit";
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'beneficiaryService', 'managewithdrawbeneficiary',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // Validate mobile number
        if (!this.validateMobileNumber(response)) {
            const errorMessage = "Invalid mobile number. Please enter a valid M-PESA number:\n\nFormat: 07_ or 01_\n\n0. Back\n00. Exit";
            return this.sendResponse(res, 'con', errorMessage);
        }

        sessionData.beneficiaryMobile = this.formatMobileNumber(response);
        await this.ussdService.saveSession(session, sessionData);

        return await this.addwithdrawbeneficiaryname(customer, msisdn, session, shortcode, null, res);
    }

    async addwithdrawbeneficiaryname(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'addwithdrawbeneficiaryname', 'addwithdrawbeneficiary');
            // Add back/exit options
            const message = "Enter beneficiary name\n\n0. Back\n00. Exit";
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'beneficiaryService', 'addwithdrawbeneficiary',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response.length < 2) {
            const errorMessage = "Invalid name. Please enter a proper name:\n\n0. Back\n00. Exit";
            return this.sendResponse(res, 'con', errorMessage);
        }

        sessionData.beneficiaryName = response;
        await this.ussdService.saveSession(session, sessionData);

        return await this.addwithdrawbeneficiaryconfirm(customer, msisdn, session, shortcode, null, res);
    }

    async viewwithdrawbeneficiaries(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'viewwithdrawbeneficiaries', 'managewithdrawbeneficiary');

            try {
                // Get beneficiaries from API
                const result = await this.ussdService.getInternalTransferBeneficiaries(
                    customer, msisdn, session, shortcode
                );

                this.logger.info(`[BENEFICIARY] View beneficiaries raw result: ${JSON.stringify(result)}`);

                let message = "Your M-PESA Beneficiaries:\n\n";

                if (result.STATUS === '000' || result.STATUS === 'OK') {
                    const beneficiaries = this.parseBeneficiaries(result.DATA);
                    this.logger.info(`[BENEFICIARY] Parsed beneficiaries: ${JSON.stringify(beneficiaries)}`);

                    if (beneficiaries.length > 0) {
                        beneficiaries.forEach((beneficiary, index) => {
                            const [account, alias] = beneficiary;
                            message += `${index + 1}. ${alias} - ${this.formatDisplayMobile(account)}\n`;
                        });
                    } else {
                        message += "No beneficiaries found.\n";
                    }
                } else {
                    message += "Unable to load beneficiaries.\n";
                }

                message += "\n0. Back\n00. Exit";
                return this.sendResponse(res, 'con', message);

            } catch (error) {
                this.logger.error(`[BENEFICIARY] View beneficiaries error: ${error.message}`);
                return this.sendResponse(res, 'con', "Unable to load beneficiaries at the moment.\n\n0. Back\n00. Exit");
            }
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'beneficiaryService', 'managewithdrawbeneficiary',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        // If user enters any other number (1, 2, etc.), just show the same view again
        // This prevents accidental navigation when user tries to select a beneficiary
        return await this.viewwithdrawbeneficiaries(customer, msisdn, session, shortcode, null, res);
    }

    async deletewithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        let sessionData = await this.ussdService.getSession(session);

        this.logger.info(`[BENEFICIARY DEBUG] deletewithdrawbeneficiary called`);
        this.logger.info(`[BENEFICIARY DEBUG] Response: "${response}"`);
        this.logger.info(`[BENEFICIARY DEBUG] Session menu: ${sessionData.current_menu}`);
        this.logger.info(`[BENEFICIARY DEBUG] Session beneficiaries: ${JSON.stringify(sessionData.beneficiaries)}`);

        if (!response || response === 'null') {
            this.logger.info(`[BENEFICIARY DEBUG] Showing delete beneficiary list`);

            await this.updateSessionMenu(session, 'deletewithdrawbeneficiary', 'managewithdrawbeneficiary');

            try {
                // Get beneficiaries from API
                const result = await this.ussdService.getInternalTransferBeneficiaries(
                    customer, msisdn, session, shortcode
                );

                this.logger.info(`[BENEFICIARY] Delete beneficiaries raw result: ${JSON.stringify(result)}`);

                let message = "Select beneficiary to delete:\n\n";

                if (result.STATUS === '000' || result.STATUS === 'OK') {
                    const beneficiaries = this.parseBeneficiaries(result.DATA);
                    this.logger.info(`[BENEFICIARY] Parsed beneficiaries for delete: ${JSON.stringify(beneficiaries)}`);

                    // Save to session and verify it was saved
                    sessionData.beneficiaries = beneficiaries;
                    await this.ussdService.saveSession(session, sessionData);

                    // Verify the save worked
                    const verifySession = await this.ussdService.getSession(session);
                    this.logger.info(`[BENEFICIARY] Verified session beneficiaries: ${JSON.stringify(verifySession.beneficiaries)}`);

                    if (beneficiaries.length > 0) {
                        beneficiaries.forEach((beneficiary, index) => {
                            const [account, alias] = beneficiary;
                            message += `${index + 1}. ${alias} - ${this.formatDisplayMobile(account)}\n`;
                        });
                    } else {
                        message += "No beneficiaries found.\n";
                    }
                } else {
                    message += "Unable to load beneficiaries.\n";
                }

                message += "\n0. Back\n00. Exit";
                return this.sendResponse(res, 'con', message);

            } catch (error) {
                this.logger.error(`[BENEFICIARY] Delete beneficiaries error: ${error.message}`);
                return this.sendResponse(res, 'con', "Unable to load beneficiaries at the moment.\n\n0. Back\n00. Exit");
            }
        } else {
            this.logger.info(`[BENEFICIARY DEBUG] Processing selection: ${response}`);

            // Refresh session data
            sessionData = await this.ussdService.getSession(session);

            if (response === '0') {
                this.logger.info(`[BENEFICIARY DEBUG] Handling back navigation`);
                return await this.handleBack(sessionData, 'beneficiaryService', 'managewithdrawbeneficiary',
                    msisdn, session, shortcode, res);
            }

            if (response === '00') {
                this.logger.info(`[BENEFICIARY DEBUG] Handling exit`);
                return await this.handleExit(session, res);
            }

            // Process beneficiary selection
            const beneficiaryIndex = parseInt(response) - 1;
            const beneficiaries = sessionData.beneficiaries || [];

            this.logger.info(`[BENEFICIARY DEBUG] Processing selection ${response} as index ${beneficiaryIndex}`);

            if (isNaN(beneficiaryIndex) || beneficiaryIndex < 0 || beneficiaryIndex >= beneficiaries.length) {
                this.logger.info(`[BENEFICIARY DEBUG] Invalid selection`);
                return this.sendResponse(res, 'con', "Invalid selection.\n\n0. Back\n00. Exit");
            }

            const selectedBeneficiary = beneficiaries[beneficiaryIndex];
            sessionData.selectedBeneficiary = selectedBeneficiary;
            await this.ussdService.saveSession(session, sessionData);

            this.logger.info(`[BENEFICIARY DEBUG] Proceeding to confirmation for: ${JSON.stringify(selectedBeneficiary)}`);
            return await this.deletebeneficiaryconfirm(customer, msisdn, session, shortcode, null, res);
        }
    }

    async deletebeneficiaryconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'deletebeneficiaryconfirm', 'deletewithdrawbeneficiary');

            const [account, alias] = sessionData.selectedBeneficiary || ['', ''];
            const mobile = this.formatDisplayMobile(account);

            const message = `Delete ${alias} - ${mobile} from beneficiaries?\n\n1. Confirm\n2. Cancel`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0') {
            return await this.handleBack(sessionData, 'beneficiaryService', 'deletewithdrawbeneficiary',
                msisdn, session, shortcode, res);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response === '2') {
            return await this.handleBack(sessionData, 'beneficiaryService', 'managewithdrawbeneficiary',
                msisdn, session, shortcode, res);
        }

        if (response !== '1') {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel');
        }

        try {
            const [account, alias] = sessionData.selectedBeneficiary || ['', ''];

            // Call API to delete beneficiary
            const result = await this.ussdService.deleteInternalTransferBeneficiary(
                customer,
                account,
                alias,
                msisdn, session, shortcode
            );

            // Clear session data
            delete sessionData.selectedBeneficiary;
            delete sessionData.beneficiaries;
            await this.ussdService.saveSession(session, sessionData);

            if (result.STATUS === '000' || result.STATUS === 'OK') {
                const successMessage = result.DATA || 'Beneficiary deleted successfully';
                return this.sendResponse(res, 'con', `${successMessage}\n\n0. Back\n00. Exit`);
            } else {
                const errorMessage = result.DATA || 'Failed to delete beneficiary. Please try again.';
                return this.sendResponse(res, 'con', `${errorMessage}\n\n0. Back\n00. Exit`);
            }
        } catch (error) {
            this.logger.error(`[BENEFICIARY] Delete beneficiary error: ${error.message}`);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
        }
    }

    parseBeneficiaries(data) {
        try {
            const beneficiaries = [];
            if (data && typeof data === 'string') {
                this.logger.info(`[BENEFICIARY] Raw data to parse: "${data}"`);

                // Split by ~ and filter out empty items
                const items = data.split('~').filter(item => item.trim() && item !== '|' && item !== '');

                for (const item of items) {
                    this.logger.info(`[BENEFICIARY] Processing item: "${item}"`);

                    // Split by | and filter out empty parts
                    const parts = item.split('|').filter(part => part.trim());

                    // We need at least account and name
                    if (parts.length >= 2) {
                        const account = parts[0].trim();
                        const alias = parts[1].trim();

                        // Only add if both account and alias have values
                        if (account && alias) {
                            beneficiaries.push([account, alias]);
                            this.logger.info(`[BENEFICIARY] Added beneficiary: ${account} - ${alias}`);
                        } else {
                            this.logger.warn(`[BENEFICIARY] Skipping invalid beneficiary: account=${account}, alias=${alias}`);
                        }
                    } else {
                        this.logger.warn(`[BENEFICIARY] Insufficient parts in item: ${item}`);
                    }
                }
            }

            this.logger.info(`[BENEFICIARY] Successfully parsed ${beneficiaries.length} beneficiaries`);
            return beneficiaries;

        } catch (error) {
            this.logger.error(`[BENEFICIARY] Error parsing beneficiaries: ${error.message}`);
            return [];
        }
    }
}

module.exports = new BeneficiaryService();