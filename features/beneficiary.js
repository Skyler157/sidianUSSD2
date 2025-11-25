const baseFeature = require('./baseFeature');
const apiService = require('../services/apiService');

class BeneficiaryService extends baseFeature {
    constructor() {
        super();
    }

    async beneficiary(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'beneficiary');
            return this.displayMenu('beneficiary', res);
        }

        const menuHandlers = {
            '1': () => this.managewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res),
        };

        return await this.handleMenuFlow('beneficiary', response, menuHandlers,
            await this.ussdService.getSession(session), msisdn, session, shortcode, res);
    }

    async managewithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'managewithdrawbeneficiary', 'beneficiary');
            return this.displayMenu('managewithdrawbeneficiary', res);
        }

        const menuHandlers = {
            '1': () => this.addwithdrawbeneficiary(customer, msisdn, session, shortcode, null, res),
            '2': () => this.viewwithdrawbeneficiaries(customer, msisdn, session, shortcode, null, res),
            '3': () => this.deletewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res)
        };

        return await this.handleMenuFlow('managewithdrawbeneficiary', response, menuHandlers,
            await this.ussdService.getSession(session), msisdn, session, shortcode, res);
    }

    async addwithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            await this.updateSessionMenu(session, 'addwithdrawbeneficiary', 'managewithdrawbeneficiary');
            return this.sendResponse(res, 'con', 'Enter M-PESA mobile number:\n\n0. Back\n00. Exit');
        }

        if (response === '0' || response === '00') {
            return await this.handleMenuFlow('addwithdrawbeneficiary', response, {}, sessionData, msisdn, session, shortcode, res);
        }

        if (!this.validateMobileNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid M-PESA number:\n\n0. Back\n00. Exit');
        }

        sessionData.beneficiary_mobile = this.formatMobileNumber(response);
        sessionData.current_menu = 'addwithdrawbeneficiaryname';
        await this.ussdService.saveSession(session, sessionData);

        return this.sendResponse(res, 'con', 'Enter beneficiary name:\n\n0. Back\n00. Exit');
    }

    async addwithdrawbeneficiaryname(customer, msisdn, session, shortcode, response, res) {
    const sessionData = await this.ussdService.getSession(session);

    if (!response) {
        return this.sendResponse(res, 'con', 'Enter beneficiary name:\n\n0. Back\n00. Exit');
    }

    if (response === '0') {
        // Go back to mobile number entry
        return await this.addwithdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
    }

    if (response === '00') {
        return await this.handleExit(session, res);
    }

    if (response.length < 2 || response.length > 30) {
        return this.sendResponse(res, 'con', 'Invalid name. Name should be 2-30 characters:\n\n0. Back\n00. Exit');
    }

    sessionData.beneficiary_name = response;
    sessionData.current_menu = 'addwithdrawbeneficiaryconfirm';
    await this.ussdService.saveSession(session, sessionData);

    const displayMobile = this.formatDisplayMobile(sessionData.beneficiary_mobile);
    const message = `Save "${response}" - ${displayMobile} as M-PESA beneficiary?\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
    return this.sendResponse(res, 'con', message);
}

    async addwithdrawbeneficiaryconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        // Add validation for required session data
        if (!sessionData.beneficiary_mobile || !sessionData.beneficiary_name) {
            this.logger.error(`[BENEFICIARY] Missing session data for confirm: ${JSON.stringify(sessionData)}`);
            return await this.handleBack(sessionData, 'beneficiaryService', 'managewithdrawbeneficiary', msisdn, session, shortcode, res);
        }

        if (!response) {
            const displayMobile = this.formatDisplayMobile(sessionData.beneficiary_mobile);
            const message = `Save "${sessionData.beneficiary_name}" - ${displayMobile} as M-PESA beneficiary?\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response === '1') {
            try {
                const result = await this.saveBeneficiary(customer, msisdn, session, shortcode, {
                    name: sessionData.beneficiary_name,
                    mobile: sessionData.beneficiary_mobile,
                    type: 'MPESA'
                });

                if (result.STATUS === '000' || result.STATUS === 'OK') {
                    // Clear temporary data but maintain navigation state
                    delete sessionData.beneficiary_mobile;
                    delete sessionData.beneficiary_name;
                    sessionData.current_menu = 'managewithdrawbeneficiary';
                    sessionData.previous_menu = 'beneficiary';
                    await this.ussdService.saveSession(session, sessionData);

                    return this.sendResponse(res, 'con', `M-PESA beneficiary saved successfully!\n\n0. Back\n00. Exit`);
                } else {
                    const errorMsg = result.DATA || 'Failed to save beneficiary';
                    return this.sendResponse(res, 'end', `Error: ${errorMsg}`);
                }
            } catch (error) {
                this.logger.error(`[BENEFICIARY] Save Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
            }
        } else if (response === '2') {
            // Cancel - go back to name entry
            return await this.addwithdrawbeneficiaryname(customer, msisdn, session, shortcode, null, res);
        }

        return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel\n\n00. Exit');
    }

    async viewwithdrawbeneficiaries(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'viewwithdrawbeneficiaries';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await this.ussdService.saveSession(session, sessionData);

            try {
                const beneficiaries = await this.getBeneficiaries(customer, msisdn, session, shortcode, 'MPESA');

                if (!beneficiaries || beneficiaries.length === 0) {
                    const message = 'No M-PESA beneficiaries found.\n\n0. Back\n00. Exit';
                    return this.sendResponse(res, 'con', message);
                }

                let message = 'Your M-PESA Beneficiaries:\n\n';
                beneficiaries.forEach((beneficiary, index) => {
                    const displayMobile = this.formatDisplayMobile(beneficiary.mobile);
                    message += `${index + 1}. ${beneficiary.name} - ${displayMobile}\n`;
                });

                message += '\n0. Back\n00. Exit';
                sessionData.beneficiaries = beneficiaries;
                await this.ussdService.saveSession(session, sessionData);

                return this.sendResponse(res, 'con', message);
            } catch (error) {
                this.logger.error(`[BENEFICIARY] View Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Unable to fetch beneficiaries. Please try again later.');
            }
        }

        if (response === '0' || response === '00') {
            return await this.handleMenuFlow('viewwithdrawbeneficiaries', response, {}, sessionData, msisdn, session, shortcode, res);
        }

        return this.sendResponse(res, 'con', 'Select an option:\n\n0. Back\n00. Exit');
    }

    async deletewithdrawbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'deletewithdrawbeneficiary';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await this.ussdService.saveSession(session, sessionData);

            try {
                const beneficiaries = await this.getBeneficiaries(customer, msisdn, session, shortcode, 'MPESA');

                if (!beneficiaries || beneficiaries.length === 0) {
                    const message = 'No M-PESA beneficiaries to delete.\n\n0. Back\n00. Exit';
                    return this.sendResponse(res, 'con', message);
                }

                let message = 'Select beneficiary to delete:\n\n';
                beneficiaries.forEach((beneficiary, index) => {
                    const displayMobile = this.formatDisplayMobile(beneficiary.mobile);
                    message += `${index + 1}. ${beneficiary.name} - ${displayMobile}\n`;
                });

                message += '\n0. Back\n00. Exit';
                sessionData.beneficiaries = beneficiaries;
                await this.ussdService.saveSession(session, sessionData);

                return this.sendResponse(res, 'con', message);
            } catch (error) {
                this.logger.error(`[BENEFICIARY] Delete List Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Unable to fetch beneficiaries. Please try again later.');
            }
        }

        if (response === '0' || response === '00') {
            return await this.handleMenuFlow('deletewithdrawbeneficiary', response, {}, sessionData, msisdn, session, shortcode, res);
        }

        const selectedIndex = parseInt(response) - 1;
        const beneficiaries = sessionData.beneficiaries || [];

        if (beneficiaries[selectedIndex]) {
            const beneficiary = beneficiaries[selectedIndex];
            sessionData.selected_beneficiary = beneficiary;
            sessionData.current_menu = 'deletebeneficiaryconfirm';
            await this.ussdService.saveSession(session, sessionData);

            const displayMobile = this.formatDisplayMobile(beneficiary.mobile);
            const message = `Delete ${beneficiary.name} - ${displayMobile}?\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Exit');
        }
    }

    async deletebeneficiaryconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await this.ussdService.getSession(session);

        // Check if selected beneficiary exists
        if (!sessionData.selected_beneficiary || !sessionData.selected_beneficiary.mobile) {
            // Session expired or invalid state - restart the flow
            return await this.managewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
        }

        if (!response) {
            const beneficiary = sessionData.selected_beneficiary;
            const displayMobile = this.formatDisplayMobile(beneficiary.mobile);
            const message = `Delete ${beneficiary.name} - ${displayMobile}?\n\n1. Confirm\n2. Cancel\n\n00. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '00') {
            return await this.handleExit(session, res);
        }

        if (response === '1') {
            try {
                const result = await this.deleteBeneficiary(customer, msisdn, session, shortcode, sessionData.selected_beneficiary);

                // Clear selected beneficiary and reset menu
                delete sessionData.selected_beneficiary;
                delete sessionData.beneficiaries;
                sessionData.current_menu = 'managewithdrawbeneficiary';
                sessionData.previous_menu = 'beneficiary';
                await this.ussdService.saveSession(session, sessionData);

                if (result.STATUS === '000' || result.STATUS === 'OK') {
                    return this.sendResponse(res, 'con', 'Beneficiary deleted successfully!\n\n0. Back\n00. Exit');
                } else {
                    const errorMsg = result.DATA || 'Failed to delete beneficiary';
                    return this.sendResponse(res, 'end', `Error: ${errorMsg}`);
                }
            } catch (error) {
                this.logger.error(`[BENEFICIARY] Delete Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
            }
        } else if (response === '2') {
            // Cancel - go back to delete list
            delete sessionData.selected_beneficiary;
            await this.ussdService.saveSession(session, sessionData);
            return await this.deletewithdrawbeneficiary(customer, msisdn, session, shortcode, null, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n1. Confirm\n2. Cancel\n\n00. Exit');
        }
    }

    async deleteBeneficiary(customer, msisdn, session, shortcode, beneficiary) {
        const formid = 'O-DeleteUtilityAlias';
        const data = `FORMID:${formid}:SERVICETYPE:MMONEY:UTILITYID:MPESA:UTILITYACCOUNTID:${beneficiary.mobile}:UTILITYALIAS:${beneficiary.name}:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

        this.logger.info(`[BENEFICIARY] Deleting beneficiary: ${JSON.stringify(beneficiary)}`);

        const apiService = require('../services/apiService');
        return await apiService.makeRequest(formid, data, msisdn, session, shortcode);
    }

    async saveBeneficiary(customer, msisdn, session, shortcode, beneficiaryData) {
        const formid = 'O-AddUtilityAlias';
        const data = `FORMID:${formid}:SERVICETYPE:MMONEY:UTILITYID:MPESA:UTILITYACCOUNTID:${beneficiaryData.mobile}:UTILITYALIAS:${beneficiaryData.name}:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

        this.logger.info(`[BENEFICIARY] Saving beneficiary: ${JSON.stringify(beneficiaryData)}`);
        return await apiService.makeRequest(formid, data, msisdn, session, shortcode);
    }

    async getBeneficiaries(customer, msisdn, session, shortcode, type) {
        const formid = 'O-GetUtilityAlias';
        const data = `FORMID:${formid}:SERVICETYPE:MMONEY:SERVICEID:MPESA:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

        try {
            const response = await apiService.makeRequest(formid, data, msisdn, session, shortcode);

            if (response.STATUS === '000' || response.STATUS === 'OK') {
                return this.parseBeneficiaries(response.DATA);
            } else {
                this.logger.warn(`[BENEFICIARY] Get beneficiaries failed: ${response.DATA}`);
                return [];
            }
        } catch (error) {
            this.logger.error(`[BENEFICIARY] Get beneficiaries error: ${error.message}`);
            throw error;
        }
    }

    async cleanupSession(session) {
        const sessionData = await this.ussdService.getSession(session);
        delete sessionData.beneficiary_mobile;
        delete sessionData.beneficiary_name;
        delete sessionData.selected_beneficiary;
        delete sessionData.beneficiaries;
        await this.ussdService.saveSession(session, sessionData);
    }

    parseBeneficiaries(data) {
        if (!data) return [];

        try {
            const beneficiaries = [];
            const items = data.split(';');

            for (const item of items) {
                if (item.trim()) {
                    const parts = item.split(',');
                    if (parts.length >= 2) {
                        const name = parts[parts.length - 1];
                        const mobile = parts[parts.length - 2];
                        if (name && mobile) {
                            beneficiaries.push({
                                name: name.trim(),
                                mobile: mobile.trim(),
                                type: 'MPESA'
                            });
                        }
                    }
                }
            }

            return beneficiaries;
        } catch (error) {
            this.logger.error(`[BENEFICIARY] Parse beneficiaries error: ${error.message}`);
            return [];
        }
    }
}

module.exports = new BeneficiaryService();