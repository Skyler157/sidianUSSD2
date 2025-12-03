const redisService = require('../config/redis');
const apiService = require('./apiService');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

class USSDService {
    constructor() {
        this.sessionTimeout = parseInt(process.env.SESSION_TTL) || 10800; // 180 minutes (3 hours) default for USSD
        this.sessionInactivityMin = parseInt(process.env.SESSION_INACTIVITY_MIN) || 30; // 30 seconds
        this.sessionInactivityMax = parseInt(process.env.SESSION_INACTIVITY_MAX) || 60; // 60 seconds
        this.cacheCustomerTtl = parseInt(process.env.CACHE_CUSTOMER_TTL) || 300; // 5 minutes
        this.cacheAccountsTtl = parseInt(process.env.CACHE_ACCOUNTS_TTL) || 300; // 5 minutes
        this.cacheTransactionTtl = parseInt(process.env.CACHE_TRANSACTION_TTL) || 900; // 15 minutes
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

    get redisService() {
        return redisService;
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

        const endTime = now + (this.sessionTimeout * 1000);
        logger.sessionStart(sessionId, msisdn, endTime);
        logger.info(`[SESSION] New session started: ${sessionId}`);
    }

    async logSessionProgress(sessionId) {
        try {
            const startTimestampStr = await redisService.get(`ussd_session_start:${sessionId}`);
            const startTimestamp = startTimestampStr ? parseInt(startTimestampStr) : null;
            const elapsedSeconds = startTimestamp ? Math.floor((Date.now() - startTimestamp) / 1000) : 0;

            // Only log every 30 seconds to reduce noise
            if (elapsedSeconds > 0 && elapsedSeconds % 30 === 0) {
                logger.info(`SESSION TIME ELAPSED: ${elapsedSeconds} seconds`, { sessionElapsed: elapsedSeconds });
            }
        } catch (err) {
            // Silent error for progress logging
        }
    }

    async logSessionEnd(sessionId, msisdn, reason = 'user_end') {
        try {
            const startTimestampStr = await redisService.get(`ussd_session_start:${sessionId}`);
            const startTimestamp = startTimestampStr ? parseInt(startTimestampStr) : null;
            const elapsedSeconds = startTimestamp ? Math.floor((Date.now() - startTimestamp) / 1000) : 0;

            logger.info(`[SESSION] Ended: ${sessionId} (${reason}) - Duration: ${elapsedSeconds}s`);

            // Cleanup
            await this.deleteSession(sessionId);
            await redisService.del(`ussd_session_start:${sessionId}`);
        } catch (err) {
            logger.error('Failed to log session end:', err);
        }
    }
    async logSessionState(sessionId, action, menu) {
        // Only log session state changes for warnings/errors
        if (action.includes('ERROR') || action.includes('WARN')) {
            const session = await this.getSession(sessionId);
            logger.warn(`[SESSION STATE] ${action} - Menu: ${menu}`);
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

    // CACHING METHODS
    async getCachedCustomer(msisdn) {
        try {
            const cacheKey = `customer:${msisdn}`;
            const cached = await redisService.get(cacheKey);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logger.error(`[CACHE] Error getting cached customer: ${error.message}`);
            return null;
        }
    }

    async cacheCustomer(msisdn, customerData) {
        try {
            const cacheKey = `customer:${msisdn}`;
            await redisService.set(cacheKey, JSON.stringify(customerData), this.cacheCustomerTtl);
            logger.debug(`[CACHE] Customer cached for ${msisdn}`);
        } catch (error) {
            logger.error(`[CACHE] Error caching customer: ${error.message}`);
        }
    }

    async getCachedCustomerAccounts(customerId) {
        try {
            const cacheKey = `accounts:${customerId}`;
            const cached = await redisService.get(cacheKey);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logger.error(`[CACHE] Error getting cached accounts: ${error.message}`);
            return null;
        }
    }

    async cacheCustomerAccounts(customerId, accounts) {
        try {
            const cacheKey = `accounts:${customerId}`;
            await redisService.set(cacheKey, JSON.stringify(accounts), this.cacheAccountsTtl);
            logger.debug(`[CACHE] Accounts cached for customer ${customerId}`);
        } catch (error) {
            logger.error(`[CACHE] Error caching accounts: ${error.message}`);
        }
    }

    async getCachedApiResponse(cacheKey) {
        try {
            const cached = await redisService.get(`api:${cacheKey}`);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            logger.error(`[CACHE] Error getting cached API response: ${error.message}`);
            return null;
        }
    }

    async cacheApiResponse(cacheKey, response, ttl = null) {
        try {
            const finalTtl = ttl || this.cacheTransactionTtl;
            await redisService.set(`api:${cacheKey}`, JSON.stringify(response), finalTtl);
            logger.debug(`[CACHE] API response cached for key: ${cacheKey}`);
        } catch (error) {
            logger.error(`[CACHE] Error caching API response: ${error.message}`);
        }
    }

    async invalidateCustomerCache(msisdn, customerId = null) {
        try {
            const keys = [`customer:${msisdn}`];
            if (customerId) {
                keys.push(`accounts:${customerId}`);
            }
            for (const key of keys) {
                await redisService.del(key);
            }
            logger.debug(`[CACHE] Invalidated cache for customer ${msisdn}`);
        } catch (error) {
            logger.error(`[CACHE] Error invalidating cache: ${error.message}`);
        }
    }

    // SMART SESSION DIFFERENTIATION
    async determineSessionType(msisdn, sessionId, shortcode) {
        try {
            const now = new Date();
            const hour = now.getHours();
            const dayOfWeek = now.getDay();

            // Check if this is a frequent user
            const userStats = await this.getUserSessionStats(msisdn);
            const isFrequentUser = userStats && userStats.totalSessions > 5;

            // Determine session type based on patterns
            let sessionType = 'standard';

            // Business hours (8 AM - 6 PM, Mon-Fri)
            const isBusinessHours = hour >= 8 && hour <= 18 && dayOfWeek >= 1 && dayOfWeek <= 5;

            // High-frequency users get priority
            if (isFrequentUser) {
                sessionType = 'premium';
            }
            // Business hours get standard priority
            else if (isBusinessHours) {
                sessionType = 'business';
            }
            // Off-hours get basic service
            else {
                sessionType = 'basic';
            }

            // Store session type for this session
            await redisService.set(`session_type:${sessionId}`, sessionType, this.sessionTimeout);
            logger.debug(`[SESSION] Determined type: ${sessionType} for ${msisdn}`);

            return sessionType;

        } catch (error) {
            logger.error(`[SESSION] Error determining session type: ${error.message}`);
            return 'standard';
        }
    }

    async getUserSessionStats(msisdn) {
        try {
            const statsKey = `user_stats:${msisdn}`;
            const stats = await redisService.get(statsKey);

            if (stats) {
                return JSON.parse(stats);
            }

            // Initialize stats for new user
            const initialStats = {
                totalSessions: 0,
                lastSession: null,
                averageSessionDuration: 0,
                preferredServices: []
            };

            await redisService.set(statsKey, JSON.stringify(initialStats), 86400 * 30); // 30 days
            return initialStats;

        } catch (error) {
            logger.error(`[SESSION] Error getting user stats: ${error.message}`);
            return null;
        }
    }

    async updateUserSessionStats(msisdn, sessionId, duration, servicesUsed = []) {
        try {
            const statsKey = `user_stats:${msisdn}`;
            const existingStats = await this.getUserSessionStats(msisdn);

            if (existingStats) {
                const updatedStats = {
                    totalSessions: existingStats.totalSessions + 1,
                    lastSession: new Date().toISOString(),
                    averageSessionDuration: Math.round(
                        ((existingStats.averageSessionDuration * existingStats.totalSessions) + duration) /
                        (existingStats.totalSessions + 1)
                    ),
                    preferredServices: [...new Set([...existingStats.preferredServices, ...servicesUsed])]
                };

                await redisService.set(statsKey, JSON.stringify(updatedStats), 86400 * 30);
                logger.debug(`[SESSION] Updated stats for ${msisdn}`);
            }

        } catch (error) {
            logger.error(`[SESSION] Error updating user stats: ${error.message}`);
        }
    }

    async getSessionPriority(sessionType) {
        const priorities = {
            'premium': 1,    // Highest priority
            'business': 2,   // Medium priority
            'standard': 3,   // Normal priority
            'basic': 4       // Lowest priority
        };
        return priorities[sessionType] || 3;
    }

    async shouldThrottleRequest(sessionId, msisdn) {
        try {
            // Check rate limiting based on session type
            const sessionType = await redisService.get(`session_type:${sessionId}`);
            const priority = await this.getSessionPriority(sessionType);

            // Premium users get higher limits
            const limits = {
                1: 10, // premium: 10 requests per minute
                2: 5,  // business: 5 requests per minute
                3: 3,  // standard: 3 requests per minute
                4: 1   // basic: 1 request per minute
            };

            const limit = limits[priority] || 3;
            const key = `rate_limit:${msisdn}`;

            const currentCount = await redisService.get(key);
            const count = currentCount ? parseInt(currentCount) : 0;

            if (count >= limit) {
                logger.warn(`[THROTTLE] Rate limit exceeded for ${msisdn} (type: ${sessionType})`);
                return true;
            }

            // Increment counter with 60 second TTL
            await redisService.set(key, (count + 1).toString(), 60);
            return false;

        } catch (error) {
            logger.error(`[THROTTLE] Error checking rate limit: ${error.message}`);
            return false; // Allow request on error
        }
    }

    async getSessionContext(sessionId) {
        try {
            const sessionData = await this.getSession(sessionId);
            const sessionType = await redisService.get(`session_type:${sessionId}`);

            return {
                sessionId,
                sessionType: sessionType || 'standard',
                customer: sessionData?.customer,
                currentMenu: sessionData?.current_menu,
                lastActivity: sessionData?.lastActivity,
                serviceHistory: sessionData?.serviceHistory || []
            };
        } catch (error) {
            logger.error(`[SESSION] Error getting session context: ${error.message}`);
            return null;
        }
    }

    // ENHANCED CUSTOMER LOOKUP WITH CACHING
    async handleCustomerLookup(msisdn, session, shortcode) {
        logger.debug(`[USSD] handleCustomerLookup() called | msisdn=${msisdn}`);

        try {
            // Check cache first
            let customer = await this.getCachedCustomer(msisdn);
            if (customer) {
                logger.debug(`[CACHE] Customer found in cache for ${msisdn}`);
                return customer;
            }

            // Cache miss - fetch from API
            const response = await apiService.makeRequest('GETCUSTOMER', '', msisdn, session, shortcode);
            logger.debug(`[USSD] GETCUSTOMER Response: ${response?.STATUS}`);

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

                // Cache the customer data
                await this.cacheCustomer(msisdn, data);
                logger.debug(`[USSD] Customer Lookup Success and cached: ${msisdn}`);
                return data;
            }

            logger.warn(`[USSD] Customer Lookup Failed | STATUS=${response.STATUS}`);
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

    // GET AUTHENTICATED CUSTOMER (for subsequent requests in same session)
    async getAuthenticatedCustomer(session) {
        try {
            const sessionData = await this.getSession(session);
            if (sessionData?.customer?.loggedIn) {
                logger.debug(`[AUTH] Returning authenticated customer from session ${session}`);

                // Check if we need to refresh accounts from cache
                if (!sessionData.customer.accounts) {
                    const cachedAccounts = await this.getCachedCustomerAccounts(sessionData.customer.customerid);
                    if (cachedAccounts) {
                        sessionData.customer.accounts = cachedAccounts;
                        await this.saveSession(session, sessionData);
                    }
                }

                return sessionData.customer;
            }
            return null;
        } catch (error) {
            logger.error(`[AUTH] Error getting authenticated customer: ${error.message}`);
            return null;
        }
    }

    async handleBalanceCheck(customer, accountNumber, msisdn, session, shortcode) {
        logger.info(`[USSD] handleBalanceCheck() | account=${accountNumber} | customerid=${customer.customerid}`);

        try {
            const data =
                `CUSTOMERID:${customer.customerid}:` +
                `MERCHANTID:BALANCE:` +
                `BANKACCOUNTID:${accountNumber}`;

            const response = await apiService.makeRequest(
                "B-",
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
                `CUSTOMERID:${customer.customerid}:` +
                `MERCHANTID:MINISTATEMENT:` +
                `BANKACCOUNTID:${accountNumber}`;

            const response = await apiService.makeRequest(
                "B-",
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
                `CUSTOMERID:${customer.customerid}:` +
                `MERCHANTID:FULLSTATEMENT:` +
                `BANKACCOUNTID:${accountNumber}`;

            const response = await apiService.makeRequest(
                "B-",
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


    async addInternalTransferBeneficiary(customer, mobileNumber, alias, msisdn, session, shortcode) {
        logger.info(`[USSD] addInternalTransferBeneficiary() | mobile=${mobileNumber} | alias=${alias}`);

        try {
            // Correct payload based on PHP system
            const data =
                `SERVICETYPE:MMONEY:` +
                `UTILITYID:MPESA:` +
                `UTILITYACCOUNTID:${mobileNumber}:` +
                `UTILITYALIAS:${alias}:` +
                `CUSTOMERID:${customer.customerid}`;

            logger.info(`[USSD] ADD BENEFICIARY Data: ${data}`);

            const response = await apiService.makeRequest(
                "O-AddUtilityAlias",
                data,
                msisdn,
                session,
                shortcode
            );

            logger.info(`[USSD] ADD BENEFICIARY Response: ${JSON.stringify(response)}`);

            // Handle the "-)" response properly
            if (response && (response.rawResponse === '-)' || response.DATA === '-)')) {
                return {
                    STATUS: '000',
                    DATA: 'Beneficiary added successfully'
                };
            }

            return response;

        } catch (error) {
            logger.error(`[USSD] Error in addInternalTransferBeneficiary: ${error.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }

    async getInternalTransferBeneficiaries(customer, msisdn, session, shortcode) {
        logger.info(`[USSD] getInternalTransferBeneficiaries() | customerid=${customer.customerid}`);

        try {
            // Correct payload based on PHP system
            const data =
                `SERVICETYPE:MMONEY:` +
                `UTILITYID:MPESA:` +
                `CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "O-GetUtilityAlias",
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

    async deleteInternalTransferBeneficiary(customer, mobileNumber, alias, msisdn, session, shortcode) {
        logger.info(`[USSD] deleteInternalTransferBeneficiary() | mobile=${mobileNumber} | alias=${alias}`);

        try {
            const data =
                `SERVICETYPE:M-PESA:` +
                `SERVICEID:MPESA:` +
                `ACCOUNTID:${mobileNumber}:` +
                `ALIAS:${alias}:` +
                `CUSTOMERID:${customer.customerid}`;

            const response = await apiService.makeRequest(
                "O-DeleteUtilityAlias",
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
