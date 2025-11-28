const redisService = require('../config/redis');
const apiService = require('./apiService');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

class USSDService {
    constructor() {
        this.sessionTimeout = 300; // 5 minutes
        this.menus = require('../config/menus.json');

        this.testRedisConnection();
    }

    async testRedisConnection() {
        setTimeout(async () => {
            const health = await redisService.healthCheck();
            logger.info(`Redis Health Check: ${JSON.stringify(health)}`);

            await redisService.testConnection();
        }, 2000);
    }

    // Use uuid package for unique IDs
    generateUniqueId() {
        return uuidv4();
    }
    validatePIN(pin) {
        if (!pin || typeof pin !== 'string') return false;

        // PIN must be exactly 4 digits
        if (pin.length !== 4) return false;

        // PIN must contain only digits
        if (!/^\d+$/.test(pin)) return false;

        return true;
    }

    // SESSION FUNCTIONS
    async saveSession(sessionId, data) {
        if (!sessionId || !data) return;
        try {
            return await redisService.set(
                `ussd_session:${sessionId}`,
                JSON.stringify(data),
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
            await redisService.set(`ussd_session_start:${sessionId}`, now.toString());
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
        const endTime = new Date(now + (this.sessionTimeout * 1000)).toLocaleString('en-GB', options);

        logger.info('---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
        logger.info('                                                                             START');
        logger.info(`SESSION STARTED @ ${startTime}`);
        logger.info(`SESSION ENDS @ ${endTime}`);
        logger.info(`MSISDN: ${msisdn}`);
        logger.info(`SESSION ID: ${sessionId}`);
    }

    get redisService() {
        return redisService;
    }
    async logSessionTime(sessionId) {
        try {
            const startTimestampStr = await redisService.get(`ussd_session_start:${sessionId}`);
            const startTimestamp = startTimestampStr ? parseInt(startTimestampStr) : null;
            const elapsedSeconds = startTimestamp ? Math.floor((Date.now() - startTimestamp) / 1000) : 0;

            // ADD CLEAR END MARKERS:
            logger.info(`SESSION TIME ELAPSED: ${elapsedSeconds} seconds`);
            logger.info('                                                                              END');
            logger.info('---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------');
        } catch (err) {
            logger.error('Failed to log session time:', err);
        }
    }
    async logSessionState(sessionId, action, menu) {
        const session = await this.getSession(sessionId);
        logger.info(`[SESSION STATE] ${action} - Menu: ${menu}, Data: ${JSON.stringify(session)}`);
    }
    async logSessionProgress(sessionId) {
        try {
            const startTimestampStr = await redisService.get(`ussd_session_start:${sessionId}`);
            const startTimestamp = startTimestampStr ? parseInt(startTimestampStr) : null;
            const elapsedSeconds = startTimestamp ? Math.floor((Date.now() - startTimestamp) / 1000) : 0;

            logger.info(`SESSION TIME ELAPSED: ${elapsedSeconds} seconds`);
        } catch (err) {
            logger.error('Failed to log session progress:', err);
        }
    }
    async validateSession(sessionId) {
        try {
            const session = await this.getSession(sessionId);
            if (!session) {
                logger.warn(`[USSD] Session ${sessionId} not found or expired`);
                return false;
            }
            return true;
        } catch (error) {
            logger.error(`[USSD] Session validation error: ${error.message}`);
            return false;
        }
    }
    async makeRequest(service, data, msisdn, session, shortcode) {
        return await apiService.makeRequest(service, data, msisdn, session, shortcode);
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
                "FULLSTATEMENT",
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

    // Handle airtime purchase transactions
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
            return parts.length >= 2 ? parts[1] : '0';
        } catch (error) {
            logger.error(`[USSD] Error parsing airtime charges: ${error.message}`);
            return '0';
        }
    }

    async handleInternalTransfer(customer, sourceAccount, destinationAccount, amount, remark, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleInternalTransfer() | from=${sourceAccount} | to=${destinationAccount} | amount=${amount}`);

        try {
            const customerid = customer.customerid;
            const uniqueId = this.generateUniqueId();
            const deviceId = `${msisdn}${shortcode}`;

            const data = `FORMID:B-:MERCHANTID:TRANSFER:BANKACCOUNTID:${sourceAccount}:TOACCOUNT:${destinationAccount}:AMOUNT:${amount}:MESSAGE:${remark}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:TMPIN:${pin}:SESSION:${session}:BANKID:66:BANKNAME:SIDIAN:SHORTCODE:${shortcode}:COUNTRY:KENYATEST:TRXSOURCE:USSD:DEVICEID:${deviceId}:UNIQUEID:${uniqueId}`;

            logger.info(`[USSD] CORRECT Internal Transfer Data: ${data}`);

            const response = await this.makeDirectTransferRequest(data);

            logger.info(`[USSD] INTERNAL TRANSFER Raw Response: ${JSON.stringify(response)}`);

            // Response parsing
            let status = '999';
            let message = 'Transfer failed. Please try again later.';

            if (response) {
                if (response.STATUS === '000' || response.STATUS === 'OK' || response.DATA === '-)' || response.rawResponse === '-)') {
                    status = '000';
                    message = response.DATA || `Transfer of Ksh ${amount} to ${destinationAccount} was successful.`;
                } else if (response.DATA) {
                    message = response.DATA;
                    status = response.STATUS || '999';
                }
            }

            const finalResponse = { STATUS: status, DATA: message };
            logger.info(`[USSD] INTERNAL TRANSFER Processed Response: ${JSON.stringify(finalResponse)}`);
            return finalResponse;

        } catch (error) {
            logger.error(`[USSD] Error in handleInternalTransfer: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Make direct transfer request without parameter duplication
     */
    async makeDirectTransferRequest(data) {
        try {
            const axios = require('axios');

            const baseUrl = 'http://172.17.40.39:23000/MobileMallUSSD_Q1/MobileMall.asmx/U';
            const requestUrl = `${baseUrl}?b=${data}`;

            logger.info(`[USSD] CORRECT Internal Transfer Request URL: ${requestUrl}`);

            const response = await axios.get(requestUrl, {
                timeout: 30000
            });

            let responseData = response.data;
            logger.info(`[USSD] Internal Transfer API Raw Response: ${responseData}`);

            const cleanResponse = this.cleanXMLResponse(responseData);

            if (cleanResponse === '-)') {
                return {
                    STATUS: '000',
                    DATA: 'Transaction successful',
                    rawResponse: cleanResponse
                };
            }

            const parsedResponse = this.parseKeyValueResponse(cleanResponse);
            parsedResponse.rawResponse = cleanResponse;
            return parsedResponse;

        } catch (error) {
            logger.error(`[USSD] Direct transfer request error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle card transfers (Pre-paid/Credit cards)
     */
    async handleCardTransfer(customer, cardType, cardNumber, amount, sourceAccount, remark, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleCardTransfer() | cardType=${cardType} | cardNumber=${cardNumber} | amount=${amount} | account=${sourceAccount}`);

        try {
            const customerid = customer.customerid;
            const uniqueId = this.generateUniqueId();
            const deviceId = `${msisdn}${shortcode}`;

            const data = `FORMID:B-:MERCHANTID:PAYCARD:BANKACCOUNTID:${sourceAccount}:ACCOUNTID:${sourceAccount}:AMOUNT:${amount}:INFOFIELD1:${cardNumber}:INFOFIELD2:${cardType}:MESSAGE:${remark}:CUSTOMERID:${customerid}:MOBILENUMBER:${msisdn}:TMPIN:${pin}:SESSION:${session}:BANKID:66:BANKNAME:SIDIAN:SHORTCODE:${shortcode}:COUNTRY:KENYATEST:TRXSOURCE:USSD:DEVICEID:${deviceId}:UNIQUEID:${uniqueId}`;

            logger.info(`[USSD] CORRECT Card Transfer Data: ${data}`);

            const response = await this.makeDirectCardRequest(data);

            logger.info(`[USSD] CARD TRANSFER Raw Response: ${JSON.stringify(response)}`);

            let status = '999';
            let message = 'Card transfer failed. Please try again later.';

            if (response) {
                if (response.STATUS === '000' || response.STATUS === 'OK' || response.DATA === '-)' || response.rawResponse === '-)') {
                    status = '000';
                    message = `Card transfer of Ksh ${amount} was successful.`;
                } else if (response.DATA) {
                    message = response.DATA;
                    status = response.STATUS || '999';
                }
            }

            const finalResponse = { STATUS: status, DATA: message };
            logger.info(`[USSD] CARD TRANSFER Processed Response: ${JSON.stringify(finalResponse)}`);
            return finalResponse;

        } catch (error) {
            logger.error(`[USSD] Card transfer error: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    /**
     * Make direct card request without parameter duplication
     */
    async makeDirectCardRequest(data) {
        try {
            const axios = require('axios');

            const baseUrl = 'http://172.17.40.39:23000/MobileMallUSSD_Q1/MobileMall.asmx/U';
            const requestUrl = `${baseUrl}?b=${data}`;

            logger.info(`[USSD] CORRECT Request URL: ${requestUrl}`);

            const response = await axios.get(requestUrl, {
                timeout: 30000
            });

            let responseData = response.data;
            logger.info(`[USSD] API Raw Response: ${responseData}`);

            const cleanResponse = this.cleanXMLResponse(responseData);

            if (cleanResponse === '-)') {
                return {
                    STATUS: '000',
                    DATA: 'Transaction successful',
                    rawResponse: cleanResponse
                };
            }

            const parsedResponse = this.parseKeyValueResponse(cleanResponse);
            parsedResponse.rawResponse = cleanResponse;
            return parsedResponse;

        } catch (error) {
            logger.error(`[USSD] Direct request error: ${error.message}`);
            throw error;
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
        if (!sessionData) return null;
        sessionData[key] = value;
        await this.saveSession(sessionId, sessionData);
        return sessionData;
    }

    cleanXMLResponse(xmlString) {
        try {
            // Remove XML tags and get content
            const clean = xmlString.replace(/<\/?[^>]+(>|$)/g, "").trim();
            return clean;
        } catch (error) {
            logger.error(`[USSD] XML cleaning error: ${error.message}`);
            return xmlString;
        }
    }

    parseKeyValueResponse(responseString) {
        try {
            const result = {};
            const pairs = responseString.split(':');

            for (let i = 0; i < pairs.length - 1; i += 2) {
                const key = pairs[i].trim();
                const value = pairs[i + 1].trim();
                if (key && value) {
                    result[key] = value;
                }
            }

            return result;
        } catch (error) {
            logger.error(`[USSD] Key-value parsing error: ${error.message}`);
            return { STATUS: '999', DATA: responseString };
        }
    }

    async handleBillPayment(customer, merchantId, accountNumber, amount, sourceAccount, billCode, pin, msisdn, session, shortcode) {
        logger.info(`[USSD] handleBillPayment() | merchant=${merchantId} | account=${accountNumber} | amount=${amount} | billCode=${billCode}`);

        try {
            const data = `FORMID:M-:MERCHANTID:${merchantId}:BANKACCOUNTID:${sourceAccount}:ACCOUNTID:${accountNumber}:AMOUNT:${amount}:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}:INFOFIELD2:${billCode}:INFOFIELD9:${msisdn}:ACTION:PAYBILL:TMPIN:${pin}`;

            const response = await this.makeRequest(
                merchantId,
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] BILL PAYMENT Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in handleBillPayment: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    // Validate bill account
    async validateBillAccount(customer, merchantId, accountNumber, billCode, msisdn, session, shortcode) {
        logger.info(`[USSD] validateBillAccount() | merchant=${merchantId} | account=${accountNumber} | billCode=${billCode}`);

        try {
            const data = `FORMID:M-:MERCHANTID:${merchantId}:ACCOUNTID:${accountNumber}:INFOFIELD1:${billCode}:ACTION:GETNAME:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

            const response = await this.makeRequest(
                merchantId,
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] BILL VALIDATION Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in validateBillAccount: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    // Get bill payment charges
    async getBillCharges(customer, merchantId, amount, msisdn, session, shortcode) {
        logger.info(`[USSD] getBillCharges() | merchant=${merchantId} | amount=${amount}`);

        try {
            const data = `FORMID:O-GetBankMerchantCharges:MERCHANTID:${merchantId}:AMOUNT:${amount}:CUSTOMERID:${customer.customerid}:MOBILENUMBER:${msisdn}`;

            const response = await this.makeRequest(
                "O-GetBankMerchantCharges",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] BILL CHARGES Response: ${JSON.stringify(response)}`);
            return response;

        } catch (error) {
            logger.error(`[USSD] Error in getBillCharges: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }
}

module.exports = new USSDService();