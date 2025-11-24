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