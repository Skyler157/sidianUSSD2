const redisService = require('../config/redis').client;
const apiService = require('./apiService');
const logger = require('./logger');

class USSDService {
    constructor() {
        this.sessionTimeout = 300; // 5 minutes
        this.menus = require('../config/menus.json');
    }

    // -------------------------
    // SESSION FUNCTIONS
    // -------------------------
    async saveSession(sessionId, data) {
        if (!sessionId || !data) return;
        try {
            return await redisService.set(
                `ussd_session:${sessionId}`,
                JSON.stringify(data),
                'EX',
                this.sessionTimeout
            );
        } catch (error) {
            logger.error(`Redis Save Error: ${error.message}`);
        }
    }

    async getSession(sessionId) {
        if (!sessionId) return null;
        try {
            const data = await redisService.get(`ussd_session:${sessionId}`);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            logger.error(`Redis Get Error: ${error.message}`);
            return null;
        }
    }

    async deleteSession(sessionId) {
        if (!sessionId) return;
        try {
            return await redisService.del(`ussd_session:${sessionId}`);
        } catch (error) {
            logger.error(`Redis Delete Error: ${error.message}`);
        }
    }

    async logSessionStart(sessionId, msisdn) {
        const now = Date.now();
        try {
            await redisService.set(`ussd_session_start:${sessionId}`, now);
        } catch (err) {
            logger.error('Failed to save session start time:', err);
        }

        const options = {
            timeZone: 'Africa/Nairobi',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        };
        const startTime = new Date(now).toLocaleString('en-GB', options);

        logger.info('---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
        logger.info('START SESSION');
        logger.info(`MSISDN: ${msisdn}`);
        logger.info(`SESSION ID: ${sessionId}`);
        logger.info(`SESSION STARTED @ ${startTime}`);
    }

    async logSessionTime(sessionId) {
        try {
            const startTimestampStr = await redisService.get(`ussd_session_start:${sessionId}`);
            const startTimestamp = startTimestampStr ? parseInt(startTimestampStr) : null;
            const elapsedSeconds = startTimestamp ? Math.floor((Date.now() - startTimestamp) / 1000) : 0;

            logger.info(`SESSION ELAPSED TIME: ${elapsedSeconds} seconds`);
            logger.info('END SESSION');
            logger.info('---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
        } catch (err) {
            logger.error('Failed to log session time:', err);
        }
    }
    async handleCustomerLookup(msisdn, session, shortcode) {
        logger.info(
            `[USSD] handleCustomerLookup() called | msisdn=${msisdn} | session=${session} | shortcode=${shortcode}`
        );

        try {
            const response = await apiService.makeRequest('GETCUSTOMER', '', msisdn, session, shortcode);
            logger.info(`[USSD] GETCUSTOMER Response: ${JSON.stringify(response)}`);

            if (!response) {
                logger.error("[USSD] GETCUSTOMER returned null or undefined");
                return null;
            }

            if (response.STATUS === "000") {
                const data = {
                    firstname: response.FIRSTNAME,
                    lastname: response.LASTNAME,
                    customerid: response.CUSTOMERID,
                    language: response.LANGUAGE || "EN"
                };

                logger.info(`[USSD] Customer Lookup Success: ${JSON.stringify(data)}`);
                return data;
            }

            logger.warn(
                `[USSD] Customer Lookup Failed | STATUS=${response.STATUS} | MESSAGE=${response.DATA}`
            );
            return null;

        } catch (error) {
            logger.error(`[USSD] Error in handleCustomerLookup: ${error.message}`);
            return null;
        }
    }

    async handleLogin(customer, pin, msisdn, session, shortcode) {
        logger.info(
            `[USSD] handleLogin() called | customerid=${customer.customerid} | msisdn=${msisdn} | pin=[HIDDEN]`
        );

        try {
            const data = `LOGINMPIN:${pin}:CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "LOGIN",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] LOGIN Response: ${JSON.stringify(response)}`);

            if (!response) {
                logger.error("[USSD] LOGIN returned null or undefined");
                return null;
            }

            if (response.STATUS === "000") {
                let accounts = [];
                if (response.ACCOUNTS) {
                    // Split by comma first, then clean up each account
                    const accountParts = response.ACCOUNTS.split(',');
                    accounts = accountParts.map(account => {
                        return account.split('-')[0].trim();
                    }).filter(account => account.length > 0);
                }

                const data = {
                    ...customer,
                    idnumber: response.IDNUMBER || "",
                    email: response.EMAIL || "",
                    accounts: accounts,
                    alias: response.ACCOUNTS || "",
                    loggedIn: true
                };

                logger.info(`[USSD] Login Success: ${JSON.stringify(data)}`);
                return data;
            }

            logger.warn(
                `[USSD] Login Failed | STATUS=${response.STATUS} | MESSAGE=${response.DATA}`
            );
            return null;

        } catch (error) {
            logger.error(`[USSD] Error in handleLogin: ${error.message}`);
            return null;
        }
    }
    async handleBalanceCheck(customer, accountNumber, msisdn, session, shortcode) {
        logger.info(`[USSD] handleBalanceCheck() | account=${accountNumber} | customerid=${customer.customerid}`);

        try {
            const data =
                `BANKACCOUNTID:${accountNumber}:` +
                `CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "BALANCE",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] BALANCE Response: ${JSON.stringify(response)}`);

            if (!response) {
                logger.error("[USSD] BALANCE returned null");
                return { charge: 0, balanceResponse: { STATUS: '999', DATA: 'Service unavailable' } };
            }

            return { charge: 0, balanceResponse: response };

        } catch (error) {
            logger.error(`[USSD] Error in handleBalanceCheck: ${error.message}`);
            return { charge: 0, balanceResponse: { STATUS: '999', DATA: 'Service temporarily unavailable' } };
        }
    }
    async handleMiniStatement(customer, accountNumber, msisdn, session, shortcode) {
        logger.info(`[USSD] handleMiniStatement() | account=${accountNumber} | customerid=${customer.customerid}`);

        try {
            const data =
                `BANKACCOUNTID:${accountNumber}:` +
                `CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "MINISTATEMENT",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] MINISTATEMENT Response: ${JSON.stringify(response)}`);

            if (!response) {
                logger.error("[USSD] MINISTATEMENT returned null");
                return { charge: 0, statementResponse: { STATUS: '999', DATA: 'Service unavailable' } };
            }

            return { charge: 0, statementResponse: response };

        } catch (error) {
            logger.error(`[USSD] Error in handleMiniStatement: ${error.message}`);
            return { charge: 0, statementResponse: { STATUS: '999', DATA: 'Service temporarily unavailable' } };
        }
    }

    async handleFullStatement(customer, accountNumber, msisdn, session, shortcode) {
        logger.info(`[USSD] handleFullStatement() | account=${accountNumber} | customerid=${customer.customerid}`);

        try {
            const data =
                `BANKACCOUNTID:${accountNumber}:` +
                `CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "FULLSTATEMENT", // You might need to adjust this API endpoint name
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] FULLSTATEMENT Response: ${JSON.stringify(response)}`);

            if (!response) {
                logger.error("[USSD] FULLSTATEMENT returned null");
                return { charge: 0, statementResponse: { STATUS: '999', DATA: 'Service unavailable' } };
            }

            return { charge: 0, statementResponse: response };

        } catch (error) {
            logger.error(`[USSD] Error in handleFullStatement: ${error.message}`);
            return { charge: 0, statementResponse: { STATUS: '999', DATA: 'Service temporarily unavailable' } };
        }
    }

    async handleWithdraw(customer, accountNumber, recipientMobile, amount, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleWithdraw() | account=${accountNumber} | recipient=${recipientMobile} | amount=${amount}`);

        try {
            const data =
                `BANKACCOUNTID:${accountNumber}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `RECIPIENTMOBILE:${recipientMobile}:` +
                `AMOUNT:${amount}:` +
                `PIN:${pin}:` +
                `ACTION:WITHDRAW`;

            const response = await apiService.makeRequest(
                "MOBILEMONEY",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] WITHDRAW Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleWithdraw: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async handleDeposit(customer, accountNumber, amount, msisdn, session, shortcode) {
        logger.info(`[USSD] handleDeposit() | account=${accountNumber} | amount=${amount}`);

        try {
            const data =
                `BANKACCOUNTID:${accountNumber}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `AMOUNT:${amount}:` +
                `ACTION:DEPOSIT`;

            const response = await apiService.makeRequest(
                "MOBILEMONEY",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] DEPOSIT Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleDeposit: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
 * Handle airtime purchase transactions
 */
    async handleAirtimePurchase(customer, merchantId, mobileNumber, amount, sourceAccount, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleAirtimePurchase() | merchant=${merchantId} | mobile=${mobileNumber} | amount=${amount} | account=${sourceAccount}`);

        try {
            const data =
                `MERCHANTID:${merchantId}:` +
                `BANKACCOUNTID:${sourceAccount}:` +
                `ACCOUNTID:${mobileNumber}:` +
                `AMOUNT:${amount}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}:` +
                `ACTION:PAYBILL:` +
                `TMPIN:${pin}`;

            const response = await apiService.makeRequest(
                "M-",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] AIRTIME PURCHASE Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleAirtimePurchase: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Get airtime transaction charges
     */
    async getAirtimeCharges(customer, merchantId, amount, msisdn, session, shortcode) {
        logger.info(`[USSD] getAirtimeCharges() | merchant=${merchantId} | amount=${amount}`);

        try {
            const data =
                `FORMID:O-GetBankMerchantCharges:` +
                `MERCHANTID:${merchantId}:` +
                `AMOUNT:${amount}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}`;

            const response = await apiService.makeRequest(
                "O-GetBankMerchantCharges",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] AIRTIME CHARGES Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in getAirtimeCharges: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Get airtime beneficiaries
     */
    async getAirtimeBeneficiaries(customer, merchantId, msisdn, session, shortcode) {
        logger.info(`[USSD] getAirtimeBeneficiaries() | merchant=${merchantId} | customerid=${customer.customerid}`);

        try {
            const data =
                `FORMID:O-GetUtilityAlias:` +
                `SERVICETYPE:Airtime:` +
                `SERVICEID:${merchantId}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}`;

            const response = await apiService.makeRequest(
                "O-GetUtilityAlias",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] AIRTIME BENEFICIARIES Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in getAirtimeBeneficiaries: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Parse airtime beneficiaries from API response
     */
    parseAirtimeBeneficiaries(apiResponse) {
        if (!apiResponse || (apiResponse.STATUS !== '000' && apiResponse.STATUS !== 'OK') || !apiResponse.DATA) {
            return [];
        }

        try {
            const beneficiaries = [];
            const items = apiResponse.DATA.split(';');

            for (const item of items) {
                if (item.trim()) {
                    const parts = item.split(',');
                    if (parts.length >= 3) {
                        const merchantId = parts[0].trim();
                        const mobileNumber = parts[1].trim();
                        const alias = parts[2].trim();

                        // Only add if all fields are present and not empty
                        if (merchantId && mobileNumber && alias) {
                            beneficiaries.push([merchantId, mobileNumber, alias]);
                        }
                    }
                }
            }

            logger.info(`[USSD] Parsed ${beneficiaries.length} beneficiaries from API response`);
            return beneficiaries;
        } catch (error) {
            logger.error(`[USSD] Error parsing airtime beneficiaries: ${error.message}`);
            return [];
        }
    }

    /**
     * Parse airtime charges from API response
     */
    parseAirtimeCharges(apiResponse) {
        if (!apiResponse || (apiResponse.STATUS !== '000' && apiResponse.STATUS !== 'OK') || !apiResponse.DATA) {
            return '0';
        }

        try {
            const parts = apiResponse.DATA.split('|');
            // The charge is in the second part: "ChargeAmount|5.00"
            return parts.length >= 2 ? parts[1] : '0';
        } catch (error) {
            logger.error(`[USSD] Error parsing airtime charges: ${error.message}`);
            return '0';
        }
    }

    async handleInternalTransfer(customer, sourceAccount, destinationAccount, amount, remark, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleInternalTransfer() | from=${sourceAccount} | to=${destinationAccount} | amount=${amount}`);

        try {
            const data =
                `FORMID:B-:` +
                `MERCHANTID:TRANSFER:` +
                `BANKACCOUNTID:${sourceAccount}:` +
                `TOACCOUNT:${destinationAccount}:` +
                `AMOUNT:${amount}:` +
                `MESSAGE:${remark}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}:` +
                `TMPIN:${pin}`;

            const response = await apiService.makeRequest(
                "TRANSFER",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] INTERNAL TRANSFER Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleInternalTransfer: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Handle card transfers (Pre-paid/Credit cards)
     */
    async handleCardTransfer(customer, cardType, cardNumber, amount, sourceAccount, remark, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleCardTransfer() | cardType=${cardType} | cardNumber=${cardNumber} | amount=${amount} | account=${sourceAccount}`);

        try {
            const data =
                `FORMID:B-:` +
                `MERCHANTID:PAYCARD:` +
                `BANKACCOUNTID:${sourceAccount}:` +
                `ACCOUNTID:${sourceAccount}:` +
                `AMOUNT:${amount}:` +
                `INFOFIELD1:${cardNumber}:` +
                `INFOFIELD2:${cardType}:` +
                `MESSAGE:${remark}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}:` +
                `TMPIN:${pin}`;

            const response = await apiService.makeRequest(
                "PAYCARD",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] CARD TRANSFER Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleCardTransfer: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Handle external bank transfers (EFT/RTGS)
     */
    async handleBankTransfer(customer, transferType, bankCode, branchCode, accountNumber, accountName, amount, sourceAccount, remark, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleBankTransfer() | type=${transferType} | bank=${bankCode} | branch=${branchCode} | account=${accountNumber} | amount=${amount}`);

        try {
            const data =
                `FORMID:B-:` +
                `MERCHANTID:${transferType}:` +
                `BANKACCOUNTID:${sourceAccount}:` +
                `TOACCOUNT:${accountNumber}:` +
                `AMOUNT:${amount}:` +
                `INFOFIELD1:${accountName}:` +
                `INFOFIELD2:${bankCode}:` +
                `INFOFIELD3:${branchCode}:` +
                `MESSAGE:${remark}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}:` +
                `TMPIN:${pin}`;

            const response = await apiService.makeRequest(
                transferType,
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] BANK TRANSFER Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleBankTransfer: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Get list of banks or branches for external transfers
     */
    async getBankList(customer, filter, msisdn, session, shortcode) {
        logger.info(`[USSD] getBankList() | filter=${filter}`);

        try {
            const data = `FILTER:${filter}`;

            const response = await apiService.makeRequest(
                "GetCommercialBankWithFilter",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] BANK LIST Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in getBankList: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Get list of branches for a specific bank
     */
    async getBranchList(customer, bankCode, filter, msisdn, session, shortcode) {
        logger.info(`[USSD] getBranchList() | bank=${bankCode} | filter=${filter}`);

        try {
            const data = `BANKCODE:${bankCode}:FILTER:${filter}`;

            const response = await apiService.makeRequest(
                "GetCommercialBankBranchWithFilter",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] BRANCH LIST Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in getBranchList: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Manage internal transfer beneficiaries
     */
    async getInternalTransferBeneficiaries(customer, msisdn, session, shortcode) {
        logger.info(`[USSD] getInternalTransferBeneficiaries() | customerid=${customer.customerid}`);

        try {
            const data =
                `FORMID:O-GETTRANSFERBENEFICIARY:` +
                `BENFTYPE:INTERNAL:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}`;

            const response = await apiService.makeRequest(
                "O-GETTRANSFERBENEFICIARY",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] GET BENEFICIARIES Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in getInternalTransferBeneficiaries: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async addInternalTransferBeneficiary(customer, accountNumber, alias, msisdn, session, shortcode) {
        logger.info(`[USSD] addInternalTransferBeneficiary() | account=${accountNumber} | alias=${alias}`);

        try {
            const data =
                `FORMID:O-ADDTRANSFERBENEFICIARY:` +
                `MERCHANTID:TRANSFER:` +
                `BENFTYPE:INTERNAL:` +
                `BENFACCOUNTID:${accountNumber}:` +
                `BENFALIAS:${alias}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}`;

            const response = await apiService.makeRequest(
                "O-ADDTRANSFERBENEFICIARY",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] ADD BENEFICIARY Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in addInternalTransferBeneficiary: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async deleteInternalTransferBeneficiary(customer, accountNumber, alias, msisdn, session, shortcode) {
        logger.info(`[USSD] deleteInternalTransferBeneficiary() | account=${accountNumber} | alias=${alias}`);

        try {
            const data =
                `FORMID:O-DeleteTransferBeneficiary:` +
                `BENFTYPE:INTERNAL:` +
                `BENFACCOUNTID:${accountNumber}:` +
                `BENFALIAS:${alias}:` +
                `CUSTOMERID:${customer.customerid}:` +
                `MOBILENUMBER:${msisdn}`;

            const response = await apiService.makeRequest(
                "O-DeleteTransferBeneficiary",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] DELETE BENEFICIARY Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in deleteInternalTransferBeneficiary: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async handleTermDeposit(customer, depositType, tenure, amount, accountNumber, msisdn, session, shortcode) {
        logger.info(`[USSD] handleTermDeposit() | type=${depositType} | tenure=${tenure} | amount=${amount} | account=${accountNumber}`);

        try {
            const data =
                `DEPOSITTYPE:${depositType}:` +
                `TENURE:${tenure}:` +
                `AMOUNT:${amount}:` +
                `BANKACCOUNTID:${accountNumber}:` +
                `CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "TERMDEPOSIT",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] TERMDEPOSIT Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleTermDeposit: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async handlePinChange(customer, oldPin, newPin, msisdn, session, shortcode) {
        logger.info(`[USSD] handlePinChange() | customerid=${customer.customerid}`);

        try {
            const data =
                `OLDPIN:${oldPin}:` +
                `NEWPIN:${newPin}:` +
                `CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "PINCHANGE",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] PINCHANGE Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handlePinChange: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async updateSessionMenu(sessionId, key, value) {
        const sessionData = await this.getSession(sessionId);
        if (!sessionData) return null; // prevent "cannot set property of null"
        sessionData[key] = value;
        await this.saveSession(sessionId, sessionData);
        return sessionData;
    }
}

module.exports = new USSDService();