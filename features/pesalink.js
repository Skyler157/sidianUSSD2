const baseFeature = require('./baseFeature');
const logger = require('../services/logger');
const ussdService = require('../services/ussdService');

class PesaLinkService extends baseFeature {
    constructor() {
        super();
        this.name = 'pesalink';
        this.itemsPerPage = 4;
    }

    /**
     * Main PesaLink menu - shows options
     */
    async pesalink(customer, msisdn, session, shortcode, response, res) {
        try {
            if (!response) {
                await this.updateSessionMenu(session, 'pesalink', 'mobilebanking');
                return this.displayMenu('pesalink', res);
            }

            if (response === '0') {
                await this.updateSessionMenu(session, 'mobilebanking', 'pesalink');
                return this.displayMenu('mobilebanking', res);
            }

            if (response === '00') {
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
            }

            const optionIndex = parseInt(response) - 1;
            const options = [
                { name: 'Send to Account', id: 'account', method: 'pesalinkaccount' },
                { name: 'Send to Phone', id: 'phone', method: 'pesalinkphone' },
                { name: 'Register Account', id: 'register', method: 'pesalinkipsl' },
                { name: 'Deregister Account', id: 'deregister', method: 'pesalinkipsl' },
                { name: 'Nominate Primary Account', id: 'nominate', method: 'pesalinkipsl' }
            ];

            if (isNaN(optionIndex) || optionIndex < 0 || optionIndex >= options.length) {
                return this.displayMenu('pesalink', res, 'Invalid option. Please try again.\n\n');
            }

            const selectedOption = options[optionIndex];
            await this.updateSessionMenu(session, 'pesalink_type', selectedOption.id);
            await this.updateSessionMenu(session, 'current_menu', selectedOption.method);

            return this[selectedOption.method](customer, msisdn, session, shortcode, null, res);

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalink: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    /**
     * Account-to-Account transfer - select bank
     */
    async pesalinkaccount(customer, msisdn, session, shortcode, response, res) {
        try {
            if (!response) {
                await this.updateSessionMenu(session, 'pesalinkaccount', 'pesalink');
                return this.sendResponse(res, 'con', 'Enter the first letter of the recipient bank\n\n0. Back\n00. Home\n000. Exit');
            }

            if (response === '0') {
                await this.updateSessionMenu(session, 'pesalink', 'pesalinkaccount');
                return this.pesalink(customer, msisdn, session, shortcode, null, res);
            }

            if (response === '00') {
                await this.updateSessionMenu(session, 'mobilebanking', 'pesalinkaccount');
                return this.displayMenu('mobilebanking', res);
            }

            if (response === '000') {
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
            }

            // Validate input is a single letter
            if (!/^[A-Za-z]$/.test(response) || response.length !== 1) {
                return this.sendResponse(res, 'con', 'Invalid input. Please enter a single letter (A-Z):\n\n0. Back\n00. Home\n000. Exit');
            }

            const filter = response.toUpperCase();
            await this.updateSessionMenu(session, 'bank_filter', filter);
            await this.updateSessionMenu(session, 'current_menu', 'pesalinkaccountbanklist');

            // Clear pagination data
            await ussdService.redisService.del(`pesalink_banklist_${session}`);
            await ussdService.redisService.del(`pesalink_currentpage_${session}`);

            return this.pesalinkaccountbanklist(customer, msisdn, session, shortcode, null, res);

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkaccount: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    /**
     * Display bank list with pagination
     */
    async pesalinkaccountbanklist(customer, msisdn, session, shortcode, response, res) {
        try {
            // Get bank list from API
            const sessionData = await this.ussdService.getSession(session);
            const filter = sessionData?.bank_filter || '';
            let bankList = await ussdService.redisService.get(`pesalink_banklist_${session}`);
            
            if (!bankList) {
                const apiResponse = await this.getBankList(customer, filter, msisdn, session, shortcode);
                
                if (!apiResponse || apiResponse.STATUS !== '000') {
                    const name = customer.firstname || customer.lastname || 'Customer';
                    return this.sendResponse(res, 'con', `Dear ${name}, the list of banks is not available at the moment. Please try again later.\n\n0. Back\n00. Home\n000. Exit`);
                }
                
                // Parse bank list from API response
                bankList = this.parseBankList(apiResponse.DATA);
                await ussdService.redisService.set(`pesalink_banklist_${session}`, JSON.stringify(bankList), 300); // Cache for 5 minutes
            } else {
                bankList = JSON.parse(bankList);
            }

            // Handle pagination
            let currentPage = parseInt(await ussdService.redisService.get(`pesalink_currentpage_${session}`)) || 1;
            const totalItems = bankList.length;
            const totalPages = Math.ceil(totalItems / this.itemsPerPage);

            // Handle navigation commands
            if (response === 'P' && currentPage > 1) {
                currentPage--;
                await ussdService.redisService.set(`pesalink_currentpage_${session}`, currentPage, 300);
            } else if (response === 'N' && currentPage < totalPages) {
                currentPage++;
                await ussdService.redisService.set(`pesalink_currentpage_${session}`, currentPage, 300);
            }

            // Handle option selection
            if (response && response !== 'P' && response !== 'N') {
                if (response === '0') {
                    await this.updateSessionMenu(session, 'pesalinkaccount', 'pesalinkaccountbanklist');
                    return this.pesalinkaccount(customer, msisdn, session, shortcode, null, res);
                }

                if (response === '00') {
                    await this.updateSessionMenu(session, 'mobilebanking', 'pesalinkaccountbanklist');
                    return this.displayMenu('mobilebanking', res);
                }

                if (response === '000') {
                    return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
                }

                const optionIndex = parseInt(response) - 1;
                const startIndex = (currentPage - 1) * this.itemsPerPage;
                const actualIndex = startIndex + optionIndex;

                if (isNaN(optionIndex) || actualIndex < 0 || actualIndex >= bankList.length) {
                    // Stay on current page - fall through to display
                } else {
                    const selectedBank = bankList[actualIndex];
                    await this.updateSessionMenu(session, 'selected_bank', selectedBank);
                    await this.updateSessionMenu(session, 'current_menu', 'pesalinkaccountid');
                    return this.pesalinkaccountid(customer, msisdn, session, shortcode, null, res);
                }
            }

            // Display current page
            const startIndex = (currentPage - 1) * this.itemsPerPage;
            const endIndex = Math.min(startIndex + this.itemsPerPage, totalItems);
            const pageItems = bankList.slice(startIndex, endIndex);

            let message = `Page ${currentPage} of ${totalPages}\n\n`;
            pageItems.forEach((bank, index) => {
                message += `${startIndex + index + 1}. ${bank.name}\n`;
            });

            // Navigation options
            let navigation = '';
            if (currentPage > 1 && currentPage < totalPages) {
                navigation = "P.Previous N.Next\n";
            } else if (currentPage > 1) {
                navigation = "P.Previous\n";
            } else if (currentPage < totalPages) {
                navigation = "N.Next\n";
            }

            return this.sendResponse(res, 'con', message + '\n' + navigation + '0.Back 00.Home 000.Exit');

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkaccountbanklist: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    /**
     * Enter account number for selected bank
     */
    async pesalinkaccountid(customer, msisdn, session, shortcode, response, res) {
        try {
            const sessionData = await this.ussdService.getSession(session);
            const selectedBank = sessionData?.selected_bank;
            
            if (!selectedBank) {
                await this.updateSessionMenu(session, 'pesalinkaccountbanklist', 'pesalinkaccountid');
                return this.pesalinkaccountbanklist(customer, msisdn, session, shortcode, null, res);
            }

            if (!response) {
                await this.updateSessionMenu(session, 'pesalinkaccountid', 'pesalinkaccountbanklist');
                return this.sendResponse(res, 'con', `Enter the ${selectedBank.name} account number\n\n0. Back\n00. Home\n000. Exit`);
            }

            if (response === '0') {
                await this.updateSessionMenu(session, 'pesalinkaccountbanklist', 'pesalinkaccountid');
                return this.pesalinkaccountbanklist(customer, msisdn, session, shortcode, null, res);
            }

            if (response === '00') {
                await this.updateSessionMenu(session, 'mobilebanking', 'pesalinkaccountid');
                return this.displayMenu('mobilebanking', res);
            }

            if (response === '000') {
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
            }

            if (!/^\d+$/.test(response)) {
                return this.sendResponse(res, 'con', 'Invalid account number. Please enter digits only:\n\n0. Back\n00. Home\n000. Exit');
            }

            await this.updateSessionMenu(session, 'recipient_account', response);
            await this.updateSessionMenu(session, 'current_menu', 'pesalinkaccountamount');

            return this.pesalinkaccountamount(customer, msisdn, session, shortcode, null, res);

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkaccountid: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    /**
     * Enter amount for A2A transfer
     */
    async pesalinkaccountamount(customer, msisdn, session, shortcode, response, res) {
        try {
            if (!response) {
                await this.updateSessionMenu(session, 'pesalinkaccountamount', 'pesalinkaccountid');
                return this.sendResponse(res, 'con', 'Enter Amount\n\n0. Back\n00. Home\n000. Exit');
            }

            if (response === '0') {
                await this.updateSessionMenu(session, 'pesalinkaccountid', 'pesalinkaccountamount');
                return this.pesalinkaccountid(customer, msisdn, session, shortcode, null, res);
            }

            if (response === '00') {
                await this.updateSessionMenu(session, 'mobilebanking', 'pesalinkaccountamount');
                return this.displayMenu('mobilebanking', res);
            }

            if (response === '000') {
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
            }

            if (!/^\d+$/.test(response)) {
                return this.sendResponse(res, 'con', 'Invalid amount. Please enter digits only:\n\n0. Back\n00. Home\n000. Exit');
            }

            const amount = parseInt(response);
            if (amount < 10) {
                return this.sendResponse(res, 'con', 'Minimum amount is Ksh 10. Please enter a valid amount:\n\n0. Back\n00. Home\n000. Exit');
            }

            await this.updateSessionMenu(session, 'amount', amount);
            await this.updateSessionMenu(session, 'current_menu', 'pesalinkaccountbankaccount');

            // Display source accounts
            const accounts = customer.accounts || [];
            if (accounts.length === 0) {
                return this.sendResponse(res, 'end', 'No accounts found. Please contact customer care.');
            }

            let message = 'Select source account:\n';
            accounts.forEach((account, index) => {
                message += `${index + 1}. ${account}\n`;
            });
            message += '\n0. Back\n00. Home\n000. Exit';

            return this.sendResponse(res, 'con', message);

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkaccountamount: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    /**
     * Select source account for A2A transfer
     */
    async pesalinkaccountbankaccount(customer, msisdn, session, shortcode, response, res) {
        try {
            const accounts = customer.accounts || [];

            if (!response) {
                await this.updateSessionMenu(session, 'pesalinkaccountbankaccount', 'pesalinkaccountamount');
                let message = 'Select source account:\n';
                accounts.forEach((account, index) => {
                    message += `${index + 1}. ${account}\n`;
                });
                message += '\n0. Back\n00. Home\n000. Exit';

                return this.sendResponse(res, 'con', message);
            }

            if (response === '0') {
                await this.updateSessionMenu(session, 'pesalinkaccountamount', 'pesalinkaccountbankaccount');
                return this.pesalinkaccountamount(customer, msisdn, session, shortcode, null, res);
            }

            if (response === '00') {
                await this.updateSessionMenu(session, 'mobilebanking', 'pesalinkaccountbankaccount');
                return this.displayMenu('mobilebanking', res);
            }

            if (response === '000') {
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
            }

            const accountIndex = parseInt(response) - 1;
            if (isNaN(accountIndex) || accountIndex < 0 || accountIndex >= accounts.length) {
                let message = 'Invalid selection. Please select a valid account:\n';
                accounts.forEach((acc, idx) => {
                    message += `${idx + 1}. ${acc}\n`;
                });
                message += '\n0. Back\n00. Home\n000. Exit';
                return this.sendResponse(res, 'con', message);
            }

            const selectedAccount = accounts[accountIndex];
            await this.updateSessionMenu(session, 'source_account', selectedAccount);
            await this.updateSessionMenu(session, 'current_menu', 'pesalinkaccountremark');

            return this.pesalinkaccountremark(customer, msisdn, session, shortcode, null, res);

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkaccountbankaccount: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    /**
     * Enter remark for A2A transfer
     */
    async pesalinkaccountremark(customer, msisdn, session, shortcode, response, res) {
        try {
            if (!response) {
                await this.updateSessionMenu(session, 'pesalinkaccountremark', 'pesalinkaccountbankaccount');
                return this.sendResponse(res, 'con', 'Enter Remark\n\n0. Back\n00. Home\n000. Exit');
            }

            if (response === '0') {
                await this.updateSessionMenu(session, 'pesalinkaccountbankaccount', 'pesalinkaccountremark');
                return this.pesalinkaccountbankaccount(customer, msisdn, session, shortcode, null, res);
            }

            if (response === '00') {
                await this.updateSessionMenu(session, 'mobilebanking', 'pesalinkaccountremark');
                return this.displayMenu('mobilebanking', res);
            }

            if (response === '000') {
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
            }

            await this.updateSessionMenu(session, 'remark', response);
            await this.updateSessionMenu(session, 'current_menu', 'pesalinkaccounttransaction');

            // Get transaction details for confirmation
            const sessionData = await this.ussdService.getSession(session);
            const amount = sessionData.amount;
            const recipientAccount = sessionData.recipient_account;
            const sourceAccount = sessionData.source_account;
            const selectedBank = sessionData.selected_bank;
            const bankName = selectedBank?.name || 'Bank';

            // Get charges
            const charges = await this.getPesaLinkCharges(customer, amount, msisdn, session, shortcode);
            const chargeMsg = charges ? `\n${charges}` : '';

            return this.sendResponse(res, 'con', `Enter PIN to send Ksh ${amount} to ${recipientAccount} ${bankName} from ${sourceAccount}${chargeMsg}`);

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkaccountremark: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    /**
     * Process A2A transaction
     */
    async pesalinkaccounttransaction(customer, msisdn, session, shortcode, response, res) {
        try {
            if (!response) {
                // This should not happen as we come here with PIN prompt
                await this.updateSessionMenu(session, 'pesalinkaccounttransaction', 'pesalinkaccountremark');
                return this.pesalinkaccountremark(customer, msisdn, session, shortcode, null, res);
            }

            // Validate PIN
            if (!this.ussdService.validatePIN(response)) {
                return this.sendResponse(res, 'con', 'Invalid PIN. Please enter a valid 4-digit PIN:');
            }

            // Get transaction details
            const sessionData = await this.ussdService.getSession(session);
            const amount = sessionData.amount;
            const recipientAccount = sessionData.recipient_account;
            const sourceAccount = sessionData.source_account;
            const selectedBank = sessionData.selected_bank;
            const remark = sessionData.remark || '';
            const bankCode = selectedBank?.code || '';
            const pin = response;

            // Process transaction
            const result = await this.processPesaLinkA2ATransaction(
                customer,
                sourceAccount,
                recipientAccount,
                bankCode,
                amount,
                remark,
                pin,
                msisdn,
                session,
                shortcode
            );

            if (result.STATUS === '000') {
                const name = customer.firstname || customer.lastname || 'Customer';
                return this.sendResponse(res, 'con', `${result.DATA || 'Transaction successful'}\n\n0. Home\n00. Exit`);
            } else {
                const name = customer.firstname || customer.lastname || 'Customer';
                return this.sendResponse(res, 'con', `Dear ${name}, ${result.DATA || 'Transaction failed. Please try again later.'}\n\n0. Back\n00. Home\n000. Exit`);
            }

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkaccounttransaction: ${error.message}`);
            const name = customer.firstname || customer.lastname || 'Customer';
            return this.sendResponse(res, 'con', `Dear ${name}, sorry the service is temporarily unavailable. Please try again later\n\n0. Home\n00. Exit`);
        }
    }

    /**
     * Account-to-Phone transfer - enter phone number
     */
    async pesalinkphone(customer, msisdn, session, shortcode, response, res) {
        try {
            if (!response) {
                await this.updateSessionMenu(session, 'pesalinkphone', 'pesalink');
                return this.sendResponse(res, 'con', 'Enter the recipient\'s mobile number\n\nFormat: 07_ or 01_\n\n0. Back\n00. Home\n000. Exit');
            }

            if (response === '0') {
                await this.updateSessionMenu(session, 'pesalink', 'pesalinkphone');
                return this.pesalink(customer, msisdn, session, shortcode, null, res);
            }

            if (response === '00') {
                await this.updateSessionMenu(session, 'mobilebanking', 'pesalinkphone');
                return this.displayMenu('mobilebanking', res);
            }

            if (response === '000') {
                return this.sendResponse(res, 'end', 'Thank you for using Sidian Bank USSD service.');
            }

            // Validate phone number
            if (!/^(07|01)\d{8}$/.test(response)) {
                return this.sendResponse(res, 'con', 'Invalid mobile number. Format: 07xxxxxxxx or 01xxxxxxxx\n\n0. Back\n00. Home\n000. Exit');
            }

            const recipientPhone = '254' + response.substring(1);
            await this.updateSessionMenu(session, 'recipient_phone', recipientPhone);
            await this.updateSessionMenu(session, 'current_menu', 'pesalinkphonebank');

            // Clear linked banks cache
            await ussdService.redisService.del(`linked_banks_${session}`);

            return this.pesalinkphonebank(customer, msisdn, session, shortcode, null, res);

        } catch (error) {
            logger.error(`[PESALINK] Error in pesalinkphone: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    // Add other methods here (they will work similarly but call sendResponse instead of returning objects)

    /**
     * API METHODS - Based on PHP implementation
     */
    async getBankList(customer, filter, msisdn, session, shortcode) {
        try {
            const data = `FORMID:GETIPSLISTING_66:FILTER:${filter}`;
            const response = await this.ussdService.makeRequest(
                'GETIPSLISTING_66',
                data,
                msisdn,
                session,
                shortcode
            );
            
            logger.info(`[PESALINK] Bank list response: ${JSON.stringify(response)}`);
            return response;
        } catch (error) {
            logger.error(`[PESALINK] Error getting bank list: ${error.message}`);
            return { STATUS: '999', DATA: 'Service unavailable' };
        }
    }

    async getLinkedBanks(customer, mobileNumber, msisdn, session, shortcode) {
        try {
            const data = `FORMID:M-:MERCHANTID:IPSL:ACCOUNTID:${mobileNumber}:INFOFIELD1:MOBILE:ACTION:GETNAME:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;
            const response = await this.ussdService.makeRequest(
                'IPSL',
                data,
                msisdn,
                session,
                shortcode
            );
            
            logger.info(`[PESALINK] Linked banks response: ${JSON.stringify(response)}`);
            return response;
        } catch (error) {
            logger.error(`[PESALINK] Error getting linked banks: ${error.message}`);
            return { STATUS: '999', DATA: 'Service unavailable' };
        }
    }

    async getPesaLinkCharges(customer, amount, msisdn, session, shortcode) {
        try {
            const data = `FORMID:O-GetBankMerchantCharges:MERCHANTID:BANKPESALINK:AMOUNT:${amount}:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;
            const response = await this.ussdService.makeRequest(
                'O-GetBankMerchantCharges',
                data,
                msisdn,
                session,
                shortcode
            );
            
            if (response.STATUS === '000') {
                return `Charges: ${response.DATA}`;
            }
            return '';
        } catch (error) {
            logger.error(`[PESALINK] Error getting charges: ${error.message}`);
            return '';
        }
    }

    async processPesaLinkA2ATransaction(customer, sourceAccount, recipientAccount, bankCode, amount, remark, pin, msisdn, session, shortcode) {
        try {
            const data = `FORMID:B-:MERCHANTID:IPSL:BANKACCOUNTID:${sourceAccount}:ACCOUNTID:${recipientAccount}:AMOUNT:${amount}:INFOFIELD1:A2A:INFOFIELD2:${bankCode}:INFOFIELD3:${recipientAccount}:INFOFIELD4:KES:INFOFIELD5:${remark}:INFOFIELD6:USSD:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}:TMPIN:${pin}:ACTION:PAYMENT`;
            
            const response = await this.ussdService.makeRequest(
                'IPSL',
                data,
                msisdn,
                session,
                shortcode
            );
            
            logger.info(`[PESALINK] A2A transaction response: ${JSON.stringify(response)}`);
            return this.parseTransactionResponse(response);
        } catch (error) {
            logger.error(`[PESALINK] Error processing A2A transaction: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async processPesaLinkA2PTransaction(customer, sourceAccount, recipientPhone, sortCode, amount, remark, pin, msisdn, session, shortcode) {
        try {
            const data = `FORMID:B-:MERCHANTID:IPSL:BANKACCOUNTID:${sourceAccount}:ACCOUNTID:${recipientPhone}:AMOUNT:${amount}:INFOFIELD1:A2P:INFOFIELD2:${sortCode}:INFOFIELD3:${recipientPhone}:INFOFIELD4:KES:INFOFIELD5:${remark}:INFOFIELD6:USSD:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}:TMPIN:${pin}:ACTION:PAYMENT`;
            
            const response = await this.ussdService.makeRequest(
                'IPSL',
                data,
                msisdn,
                session,
                shortcode
            );
            
            logger.info(`[PESALINK] A2P transaction response: ${JSON.stringify(response)}`);
            return this.parseTransactionResponse(response);
        } catch (error) {
            logger.error(`[PESALINK] Error processing A2P transaction: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async processAccountManagement(customer, accountNumber, action, msisdn, session, shortcode) {
        try {
            const data = `FORMID:M-:MERCHANTID:IPSL:ACCOUNTID:${accountNumber}:INFOFIELD1:${action}:INFOFIELD3:33129114:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}:ACTION:GETNAME`;
            
            const response = await this.ussdService.makeRequest(
                'IPSL',
                data,
                msisdn,
                session,
                shortcode
            );
            
            logger.info(`[PESALINK] Account management response: ${JSON.stringify(response)}`);
            return this.parseTransactionResponse(response);
        } catch (error) {
            logger.error(`[PESALINK] Error processing account management: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * HELPER METHODS
     */
    parseBankList(data) {
        try {
            if (!data) return [];
            
            const banks = [];
            const items = data.split(';');
            
            for (const item of items) {
                if (item.trim()) {
                    const parts = item.split(',');
                    if (parts.length >= 3) {
                        banks.push({
                            name: parts[0]?.trim(),
                            code: parts[1]?.trim(),
                            otherCode: parts[2]?.trim()
                        });
                    }
                }
            }
            
            return banks;
        } catch (error) {
            logger.error(`[PESALINK] Error parsing bank list: ${error.message}`);
            return [];
        }
    }

    parseLinkedBanks(data) {
        try {
            if (!data || !data.includes('^')) return [];
            
            const banks = [];
            const items = data.split('^')[1]?.split('~') || [];
            
            for (const item of items) {
                if (item.trim()) {
                    const pairs = {};
                    const parts = item.split('|');
                    
                    for (let i = 0; i < parts.length; i += 2) {
                        if (parts[i] && parts[i + 1]) {
                            const key = parts[i].toLowerCase().replace(/\s+/g, '');
                            pairs[key] = parts[i + 1];
                        }
                    }
                    
                    if (Object.keys(pairs).length > 0) {
                        banks.push({
                            bankname: pairs.bankname,
                            sortcode: pairs.sortcode,
                            bankcustomername: pairs.bankcustomername
                        });
                    }
                }
            }
            
            return banks;
        } catch (error) {
            logger.error(`[PESALINK] Error parsing linked banks: ${error.message}`);
            return [];
        }
    }

    parseTransactionResponse(response) {
        try {
            if (!response) {
                return { STATUS: '999', DATA: 'No response from server' };
            }
            
            if (response.STATUS === '000' || response.DATA === '-)' || response.rawResponse === '-)') {
                return { 
                    STATUS: '000', 
                    DATA: response.DATA || 'Transaction successful' 
                };
            }
            
            return {
                STATUS: response.STATUS || '999',
                DATA: response.DATA || 'Transaction failed'
            };
        } catch (error) {
            logger.error(`[PESALINK] Error parsing transaction response: ${error.message}`);
            return { STATUS: '999', DATA: 'Response parsing error' };
        }
    }
}

module.exports = new PesaLinkService();