const ussdService = require('../services/ussdService');
const logger = require('../services/logger');

class BeneficiaryService {
    constructor() {
        this.menus = require('../config/menus.json');
    }

    async beneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'beneficiary';
            sessionData.previous_menu = 'myaccount';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('beneficiary', res);
        }

        const featureManager = require('./index');
        const menuHandlers = {
            '1': () => this.manageMpesaBeneficiaries(customer, msisdn, session, shortcode, null, res),
            '2': () => this.manageAirtimeBeneficiaries(customer, msisdn, session, shortcode, null, res),
            '3': () => this.manageAccountTransferBeneficiaries(customer, msisdn, session, shortcode, null, res),
            '4': () => this.manageBillsBeneficiaries(customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleBack(sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleHome(sessionData, msisdn, session, shortcode, res),
            '000': () => this.handleExit(session, res)
        };

        if (menuHandlers[response]) {
            return await menuHandlers[response]();
        } else {
            return this.displayMenu('beneficiary', res, 'Invalid selection. Please try again.\n\n');
        }
    }

    async manageMpesaBeneficiaries(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'managewithdrawbeneficiary';
            sessionData.previous_menu = 'beneficiary';
            await ussdService.saveSession(session, sessionData);
            return this.displayMenu('managewithdrawbeneficiary', res);
        }

        const menuHandlers = {
            '1': () => this.addMpesaBeneficiary(customer, msisdn, session, shortcode, null, res),
            '2': () => this.viewMpesaBeneficiaries(customer, msisdn, session, shortcode, null, res),
            '3': () => this.deleteMpesaBeneficiary(customer, msisdn, session, shortcode, null, res),
            '0': () => this.handleBack(sessionData, msisdn, session, shortcode, res),
            '00': () => this.handleHome(sessionData, msisdn, session, shortcode, res),
            '000': () => this.handleExit(session, res)
        };

        return await this.handleMenuNavigation(response, menuHandlers, sessionData, msisdn, session, shortcode, res, 'managewithdrawbeneficiary');
    }

    async addMpesaBeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'addwithdrawbeneficiary';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await ussdService.saveSession(session, sessionData);
            
            const message = 'Enter M-PESA mobile number:\n\n0. Back\n00. Home\n000. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00' || response === '000') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate mobile number
        if (!this.validateMobileNumber(response)) {
            return this.sendResponse(res, 'con', 'Invalid mobile number. Please enter a valid M-PESA number:\n\n0. Back\n00. Home\n000. Exit');
        }

        sessionData.beneficiary_mobile = this.formatMobileNumber(response);
        sessionData.current_menu = 'addwithdrawbeneficiaryname';
        await ussdService.saveSession(session, sessionData);
        
        const message = 'Enter beneficiary name:\n\n0. Back\n00. Home\n000. Exit';
        return this.sendResponse(res, 'con', message);
    }

    async addwithdrawbeneficiaryname(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = 'Enter beneficiary name:\n\n0. Back\n00. Home\n000. Exit';
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00' || response === '000') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Validate name (basic validation)
        if (response.length < 2 || response.length > 30) {
            return this.sendResponse(res, 'con', 'Invalid name. Name should be 2-30 characters:\n\n0. Back\n00. Home\n000. Exit');
        }

        sessionData.beneficiary_name = response;
        sessionData.current_menu = 'addwithdrawbeneficiaryconfirm';
        await ussdService.saveSession(session, sessionData);
        
        const message = `Save "${response}" - ${sessionData.beneficiary_mobile} as M-PESA beneficiary?\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home\n000. Exit`;
        return this.sendResponse(res, 'con', message);
    }

    async addwithdrawbeneficiaryconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const message = `Save "${sessionData.beneficiary_name}" - ${sessionData.beneficiary_mobile} as M-PESA beneficiary?\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home\n000. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00' || response === '000') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        if (response === '1') {
            // Save beneficiary logic here
            // In a real implementation, you would call an API to save the beneficiary
            try {
                // Simulate saving beneficiary
                const saved = await this.saveBeneficiary(customer, {
                    type: 'MPESA',
                    mobile: sessionData.beneficiary_mobile,
                    name: sessionData.beneficiary_name,
                    customerId: customer.customerid
                });

                if (saved) {
                    return this.sendResponse(res, 'end', `M-PESA beneficiary "${sessionData.beneficiary_name}" saved successfully!`);
                } else {
                    return this.sendResponse(res, 'end', 'Failed to save beneficiary. Please try again later.');
                }
            } catch (error) {
                logger.error(`[BENEFICIARY] Save Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
            }
        } else if (response === '2') {
            return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Home\n000. Exit');
        }
    }

    async viewMpesaBeneficiaries(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'viewwithdrawbeneficiaries';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await ussdService.saveSession(session, sessionData);

            try {
                // Fetch beneficiaries from API
                const beneficiaries = await this.getBeneficiaries(customer, 'MPESA');
                
                if (!beneficiaries || beneficiaries.length === 0) {
                    const message = 'No M-PESA beneficiaries found.\n\n0. Back\n00. Home\n000. Exit';
                    return this.sendResponse(res, 'con', message);
                }

                let message = 'Your M-PESA Beneficiaries:\n\n';
                beneficiaries.forEach((beneficiary, index) => {
                    message += `${index + 1}. ${beneficiary.name} - ${beneficiary.mobile}\n`;
                });

                message += '\n0. Back\n00. Home\n000. Exit';
                sessionData.beneficiaries = beneficiaries;
                await ussdService.saveSession(session, sessionData);

                return this.sendResponse(res, 'con', message);
            } catch (error) {
                logger.error(`[BENEFICIARY] View Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Unable to fetch beneficiaries. Please try again later.');
            }
        }

        if (response === '0' || response === '00' || response === '000') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Handle beneficiary selection for potential actions
        return this.sendResponse(res, 'con', 'Select an option:\n\n0. Back\n00. Home\n000. Exit');
    }

    async deleteMpesaBeneficiary(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            sessionData.current_menu = 'deletewithdrawbeneficiary';
            sessionData.previous_menu = 'managewithdrawbeneficiary';
            await ussdService.saveSession(session, sessionData);

            try {
                const beneficiaries = await this.getBeneficiaries(customer, 'MPESA');
                
                if (!beneficiaries || beneficiaries.length === 0) {
                    const message = 'No M-PESA beneficiaries to delete.\n\n0. Back\n00. Home\n000. Exit';
                    return this.sendResponse(res, 'con', message);
                }

                let message = 'Select beneficiary to delete:\n\n';
                beneficiaries.forEach((beneficiary, index) => {
                    message += `${index + 1}. ${beneficiary.name} - ${beneficiary.mobile}\n`;
                });

                message += '\n0. Back\n00. Home\n000. Exit';
                sessionData.beneficiaries = beneficiaries;
                await ussdService.saveSession(session, sessionData);

                return this.sendResponse(res, 'con', message);
            } catch (error) {
                logger.error(`[BENEFICIARY] Delete List Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Unable to fetch beneficiaries. Please try again later.');
            }
        }

        if (response === '0' || response === '00' || response === '000') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        // Handle beneficiary deletion confirmation
        const selectedIndex = parseInt(response) - 1;
        const beneficiaries = sessionData.beneficiaries || [];

        if (beneficiaries[selectedIndex]) {
            const beneficiary = beneficiaries[selectedIndex];
            sessionData.selected_beneficiary = beneficiary;
            sessionData.current_menu = 'deletebeneficiaryconfirm';
            await ussdService.saveSession(session, sessionData);

            const message = `Delete ${beneficiary.name} - ${beneficiary.mobile}?\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home\n000. Exit`;
            return this.sendResponse(res, 'con', message);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Home\n000. Exit');
        }
    }

    async deletebeneficiaryconfirm(customer, msisdn, session, shortcode, response, res) {
        const sessionData = await ussdService.getSession(session);

        if (!response) {
            const beneficiary = sessionData.selected_beneficiary;
            const message = `Delete ${beneficiary.name} - ${beneficiary.mobile}?\n\n1. Confirm\n2. Cancel\n\n0. Back\n00. Home\n000. Exit`;
            return this.sendResponse(res, 'con', message);
        }

        if (response === '0' || response === '00' || response === '000') {
            return await this.handleNavigation(response, sessionData, msisdn, session, shortcode, res);
        }

        if (response === '1') {
            try {
                // Delete beneficiary logic
                const deleted = await this.deleteBeneficiary(customer, sessionData.selected_beneficiary);
                
                if (deleted) {
                    return this.sendResponse(res, 'end', 'Beneficiary deleted successfully!');
                } else {
                    return this.sendResponse(res, 'end', 'Failed to delete beneficiary. Please try again later.');
                }
            } catch (error) {
                logger.error(`[BENEFICIARY] Delete Error: ${error.message}`);
                return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again later.');
            }
        } else if (response === '2') {
            return await this.handleNavigation('0', sessionData, msisdn, session, shortcode, res);
        } else {
            return this.sendResponse(res, 'con', 'Invalid selection. Please try again:\n\n0. Back\n00. Home\n000. Exit');
        }
    }

    // Other beneficiary types (Airtime, Account Transfer, Bills)
    async manageAirtimeBeneficiaries(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'end', 'Airtime beneficiaries feature coming soon.');
    }

    async manageAccountTransferBeneficiaries(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'end', 'Account transfer beneficiaries feature coming soon.');
    }

    async manageBillsBeneficiaries(customer, msisdn, session, shortcode, response, res) {
        return this.sendResponse(res, 'end', 'Bills beneficiaries feature coming soon.');
    }

    // Helper methods
    validateMobileNumber(mobile) {
        const mobileRegex = /^(254|0)?[17]\d{8}$/;
        return mobileRegex.test(this.formatMobileNumber(mobile));
    }

    formatMobileNumber(mobile) {
        let formatted = mobile.toString().trim();
        
        if (formatted.startsWith('0')) {
            formatted = '254' + formatted.substring(1);
        } else if (!formatted.startsWith('254')) {
            formatted = '254' + formatted;
        }
        
        return formatted;
    }

    async saveBeneficiary(customer, beneficiaryData) {
        // Implement actual API call to save beneficiary
        // This is a mock implementation
        logger.info(`[BENEFICIARY] Saving beneficiary: ${JSON.stringify(beneficiaryData)}`);
        return true;
    }

    async getBeneficiaries(customer, type) {
        // Implement actual API call to get beneficiaries
        // This is a mock implementation returning sample data
        return [
            { name: "John Doe", mobile: "254712345678", type: "MPESA" },
            { name: "Jane Smith", mobile: "254723456789", type: "MPESA" }
        ];
    }

    async deleteBeneficiary(customer, beneficiary) {
        // Implement actual API call to delete beneficiary
        logger.info(`[BENEFICIARY] Deleting beneficiary: ${JSON.stringify(beneficiary)}`);
        return true;
    }

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
            const previousMenu = sessionData.previous_menu || 'myaccount';
            sessionData.current_menu = previousMenu;
            await ussdService.saveSession(session, sessionData);
            
            const featureManager = require('./index');
            return await featureManager.execute('beneficiaryService', previousMenu, sessionData.customer, msisdn, session, shortcode, null, res);
        } else if (response === '00') {
            // Go to mobile banking home
            sessionData.current_menu = 'mobilebanking';
            await ussdService.saveSession(session, sessionData);
            
            const featureManager = require('./index');
            return await featureManager.execute('navigation', 'mobilebanking', sessionData.customer, msisdn, session, shortcode, null, res);
        } else if (response === '000') {
            await ussdService.deleteSession(session);
            return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
        }
        return this.sendResponse(res, 'con', 'Invalid navigation.');
    }

    async handleBack(sessionData, msisdn, session, shortcode, res) {
        sessionData.current_menu = 'myaccount';
        await ussdService.saveSession(session, sessionData);
        
        const featureManager = require('./index');
        return await featureManager.execute('accountServices', 'myaccount', sessionData.customer, msisdn, session, shortcode, null, res);
    }

    async handleHome(sessionData, msisdn, session, shortcode, res) {
        sessionData.current_menu = 'mobilebanking';
        await ussdService.saveSession(session, sessionData);
        
        const featureManager = require('./index');
        return await featureManager.execute('navigation', 'mobilebanking', sessionData.customer, msisdn, session, shortcode, null, res);
    }

    async handleExit(session, res) {
        await ussdService.deleteSession(session);
        return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
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
            const desiredOrder = ['1', '2', '3', '4', '0', '00', '000'];
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
        logger.info(`[BENEFICIARY] ${type.toUpperCase()}: ${message}`);
        logger.info(`[BENEFICIARY] Message size: ${messageSize} bytes`);
        
        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new BeneficiaryService();