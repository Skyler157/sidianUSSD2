const featureManager = require('../features');
const logger = require('../services/logger');
const ussdService = require('../services/ussdService');

class USSDController {
    constructor() {
        this.menus = require('../config/menus.json');
        this.menuRouting = this.setupMenuRouting();
    }

    setupMenuRouting() {
        return {
            // Authentication & Core
            'home': { feature: 'authentication', method: 'home' },

            // Main Menus
            'mobilebanking': { feature: 'navigation', method: 'mobilebanking' },
            'myaccount': { feature: 'accountServices', method: 'myaccount' },
            'mobilemoney': { feature: 'mobileMoney', method: 'mobilemoney' },

            // Account Services
            'balance': { feature: 'balanceService', method: 'balance' },
            'balance_pin': { feature: 'balanceService', method: 'balance_pin' },
            'balance_result': { feature: 'balanceService', method: 'balance_result' },
            'ministatement': { feature: 'statementService', method: 'ministatement' },
            'ministatement_pin': { feature: 'statementService', method: 'ministatement_pin' },
            'ministatement_result': { feature: 'statementService', method: 'ministatement_result' },
            'fullstatement': { feature: 'statementService', method: 'fullstatement' },
            'fullstatement_pin': { feature: 'statementService', method: 'fullstatement_pin' },
            'fullstatement_result': { feature: 'statementService', method: 'fullstatement_result' },

            'beneficiary': { feature: 'beneficiaryService', method: 'beneficiary' },
            'managewithdrawbeneficiary': { feature: 'beneficiaryService', method: 'managewithdrawbeneficiary' },
            'addwithdrawbeneficiary': { feature: 'beneficiaryService', method: 'addwithdrawbeneficiary' },
            'addwithdrawbeneficiaryname': { feature: 'beneficiaryService', method: 'addwithdrawbeneficiaryname' },
            'addwithdrawbeneficiaryconfirm': { feature: 'beneficiaryService', method: 'addwithdrawbeneficiaryconfirm' },
            'viewwithdrawbeneficiaries': { feature: 'beneficiaryService', method: 'viewwithdrawbeneficiaries' },
            'deletewithdrawbeneficiary': { feature: 'beneficiaryService', method: 'deletewithdrawbeneficiary' },
            'deletebeneficiaryconfirm': { feature: 'beneficiaryService', method: 'deletebeneficiaryconfirm' },

            // Mobile Money
            'mobilemoney': { feature: 'mobileMoney', method: 'mobilemoney' },
            'withdraw': { feature: 'mobileMoney', method: 'withdraw' },
            'withdrawmsisdn': { feature: 'mobileMoney', method: 'withdrawOtherNumber' },
            'withdrawamount': { feature: 'mobileMoney', method: 'withdrawAmount' },
            'withdrawbankaccount': { feature: 'mobileMoney', method: 'withdrawBankAccount' },
            'withdrawtransaction': { feature: 'mobileMoney', method: 'withdrawTransaction' },
            'deposit': { feature: 'mobileMoney', method: 'deposit' },
            'depositbankaccount': { feature: 'mobileMoney', method: 'depositBankAccount' },
            'deposittransaction': {
                feature: 'mobileMoney', method: 'depositTransaction'
            },

            'buyfloat': { feature: 'buyfloat', method: 'buyfloat' },
            'buyfloatstore': { feature: 'buyfloat', method: 'buyfloatstore' },
            'buyfloatamount': { feature: 'buyfloat', method: 'buyfloatamount' },
            'buyfloatbankaccount': { feature: 'buyfloat', method: 'buyfloatbankaccount' },
            'buyfloatremark': { feature: 'buyfloat', method: 'buyfloatremark' },
            'buyfloattransaction': { feature: 'buyfloat', method: 'buyfloattransaction' },

            //Buy Goods
            'buygoods': { feature: 'buygoods', method: 'buygoods' },
            'buygoodsconfirm': { feature: 'buygoods', method: 'buygoodsconfirm' },
            'buygoodsamount': { feature: 'buygoods', method: 'buygoodsamount' },
            'buygoodsbankaccount': { feature: 'buygoods', method: 'buygoodsbankaccount' },
            'buygoodsremark': { feature: 'buygoods', method: 'buygoodsremark' },
            'buygoodstransaction': { feature: 'buygoods', method: 'buygoodstransaction' },

            //Paybill
            'paybill': { feature: 'paybill', method: 'paybill' },
            'paybillaccount': { feature: 'paybill', method: 'paybillaccount' },
            'paybillconfirm': { feature: 'paybill', method: 'paybillconfirm' },
            'paybillamount': { feature: 'paybill', method: 'paybillamount' },
            'paybillbankaccount': { feature: 'paybill', method: 'paybillbankaccount' },
            'paybillremark': { feature: 'paybill', method: 'paybillremark' },
            'paybilltransaction': { feature: 'paybill', method: 'paybilltransaction' },

            // Airtime 
            'airtime': { feature: 'airtime', method: 'airtime' },
            'airtimenetwork': { feature: 'airtime', method: 'airtimenetwork' },
            'airtimebeneficiary': { feature: 'airtime', method: 'airtimebeneficiary' },
            'airtimemsisdn': { feature: 'airtime', method: 'airtimemsisdn' },
            'airtimeamount': { feature: 'airtime', method: 'airtimeamount' },
            'airtimebankaccount': { feature: 'airtime', method: 'airtimebankaccount' },
            'airtimetransaction': { feature: 'airtime', method: 'airtimetransaction' },

            // Funds Transfer 
            'fundstransfer': { feature: 'fundsTransfer', method: 'fundstransfer' },
            'internaltransfer': { feature: 'fundsTransfer', method: 'internaltransfer' },
            'internaltransferbankaccount': { feature: 'fundsTransfer', method: 'internaltransferbankaccount' },
            'internaltransferamount': { feature: 'fundsTransfer', method: 'internaltransferamount' },
            'internaltransferownaccount': { feature: 'fundsTransfer', method: 'internaltransferownaccount' },
            'internaltransferremark': { feature: 'fundsTransfer', method: 'internaltransferremark' },
            'internaltransfertransaction': { feature: 'fundsTransfer', method: 'internaltransfertransaction' },
            'internaltransferotheraccount': { feature: 'fundsTransfer', method: 'internaltransferotheraccount' },

            // Card Transfer Routes
            'cardtransfer': { feature: 'fundsTransfer', method: 'cardtransfer' },
            'cardnumber': { feature: 'fundsTransfer', method: 'cardnumber' },
            'cardamount': { feature: 'fundsTransfer', method: 'cardamount' },
            'cardbankaccount': { feature: 'fundsTransfer', method: 'cardbankaccount' },
            'cardremark': { feature: 'fundsTransfer', method: 'cardremark' },
            'cardtransaction': { feature: 'fundsTransfer', method: 'cardtransaction' },

            // Bank Transfer Routes
            'banktransfer': { feature: 'fundsTransfer', method: 'banktransfer' },
            'bankfilter': { feature: 'fundsTransfer', method: 'bankfilter' },
            'banklist': { feature: 'fundsTransfer', method: 'banklist' },
            'bankbranch': { feature: 'fundsTransfer', method: 'bankbranch' },
            'bankbranchlist': { feature: 'fundsTransfer', method: 'bankbranchlist' },
            'banktrasferaccount': { feature: 'fundsTransfer', method: 'banktrasferaccount' },
            'banktrasfername': { feature: 'fundsTransfer', method: 'banktrasfername' },
            'banktrasfermount': { feature: 'fundsTransfer', method: 'banktrasfermount' },
            'banktrasferbankaccount': { feature: 'fundsTransfer', method: 'banktrasferbankaccount' },
            'banktrasferremark': { feature: 'fundsTransfer', method: 'banktrasferremark' },
            'banktrasfertransaction': { feature: 'fundsTransfer', method: 'banktrasfertransaction' },


            // Bill Payment Routes
            'billpayment': { feature: 'billPayment', method: 'billpayment' },
            'zuku': { feature: 'billPayment', method: 'zuku' },
            'billmeter': { feature: 'billPayment', method: 'billmeter' },
            'billamount': { feature: 'billPayment', method: 'billamount' },
            'billbankaccount': { feature: 'billPayment', method: 'billbankaccount' },
            'billtransaction': { feature: 'billPayment', method: 'billtransaction' },

            // Individual bill provider routes
            'dstv_account': { feature: 'billPayment', method: 'dstv_account' },
            'dstv_amount': { feature: 'billPayment', method: 'dstv_amount' },
            'dstv_account_selection': { feature: 'billPayment', method: 'dstv_account_selection' },
            'dstv_confirm': { feature: 'billPayment', method: 'dstv_confirm' },

            'gotv_account': { feature: 'billPayment', method: 'gotv_account' },
            'gotv_amount': { feature: 'billPayment', method: 'gotv_amount' },
            'gotv_account_selection': { feature: 'billPayment', method: 'gotv_account_selection' },
            'gotv_confirm': { feature: 'billPayment', method: 'gotv_confirm' },

            'zukusatellite': { feature: 'billPayment', method: 'zukusatellite' },
            'zukutrippleplay': { feature: 'billPayment', method: 'zukutrippleplay' },
            'zukusatellite_account': { feature: 'billPayment', method: 'zukusatellite_account' },
            'zukutrippleplay_account': { feature: 'billPayment', method: 'zukutrippleplay_account' },
            'zukusatellite_amount': { feature: 'billPayment', method: 'zukusatellite_amount' },
            'zukutrippleplay_amount': { feature: 'billPayment', method: 'zukutrippleplay_amount' },
            'zukusatellite_account_selection': { feature: 'billPayment', method: 'zukusatellite_account_selection' },
            'zukutrippleplay_account_selection': { feature: 'billPayment', method: 'zukutrippleplay_account_selection' },
            'zukusatellite_confirm': { feature: 'billPayment', method: 'zukusatellite_confirm' },
            'zukutrippleplay_confirm': { feature: 'billPayment', method: 'zukutrippleplay_confirm' },

            'startimes_account': { feature: 'billPayment', method: 'startimes_account' },
            'startimes_amount': { feature: 'billPayment', method: 'startimes_amount' },
            'startimes_account_selection': { feature: 'billPayment', method: 'startimes_account_selection' },
            'startimes_confirm': { feature: 'billPayment', method: 'startimes_confirm' },

            'nairobiwater_account': { feature: 'billPayment', method: 'nairobiwater_account' },
            'nairobiwater_amount': { feature: 'billPayment', method: 'nairobiwater_amount' },
            'nairobiwater_account_selection': { feature: 'billPayment', method: 'nairobiwater_account_selection' },
            'nairobiwater_confirm': { feature: 'billPayment', method: 'nairobiwater_confirm' },

            'jtl_account': { feature: 'billPayment', method: 'jtl_account' },
            'jtl_amount': { feature: 'billPayment', method: 'jtl_amount' },
            'jtl_account_selection': { feature: 'billPayment', method: 'jtl_account_selection' },
            'jtl_confirm': { feature: 'billPayment', method: 'jtl_confirm' },

            // PIN Management
            'changepin': { feature: 'pinManagement', method: 'changepin' },

            // Transaction results
            'transaction_success': { feature: 'mobileMoney', method: 'transaction_success' },
            'transaction_failed': { feature: 'mobileMoney', method: 'transaction_failed' }

        };
    }

    async handleUSSD(req, res) {
        const { sessionId, msisdn, shortcode = '527', response = '' } = req.body;

        logger.info(`[USSD] handleUSSD: ${JSON.stringify({ sessionId, msisdn, shortcode, response })}`);

        try {
            await this.handleSessionLogging(sessionId, msisdn, response);

            const sessionData = await ussdService.getSession(sessionId);

            if (!sessionData) {
                return await this.routeToFeature('home', null, msisdn, sessionId, shortcode, response, res);
            }

            const currentMenu = sessionData.current_menu || 'home';
            const customer = sessionData.customer || null;

            return await this.routeToFeature(currentMenu, customer, msisdn, sessionId, shortcode, response, res);
        } catch (error) {
            logger.error(`[USSD] Handler Error: ${error.message}`);
            // Log session end on error
            await ussdService.logSessionTime(sessionId);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    // SESSION LOGGING 
    async handleSessionLogging(sessionId, msisdn, userInput) {
        try {
            const sessionData = await ussdService.getSession(sessionId);

            // Check if this a new session or a reused ID
            if (!sessionData) {
                const existingStartTime = await ussdService.redisService.get(`ussd_session_start:${sessionId}`);

                if (existingStartTime) {
                    logger.warn(`[SESSION] Reused session ID detected: ${sessionId}`);
                    // Clean up the old session data
                    await ussdService.deleteSession(sessionId);
                    await ussdService.redisService.del(`ussd_session_start:${sessionId}`);
                }

                await ussdService.logSessionStart(sessionId, msisdn);
                logger.info(`[SESSION] New session started: ${sessionId}`);
            } else {
                // Log progress for existing session
                await ussdService.logSessionProgress(sessionId);
            }

            // If user is exiting 00, log session end
            if (userInput === '00') {
                await ussdService.logSessionTime(sessionId);
                await ussdService.deleteSession(sessionId);
                await ussdService.redisService.del(`ussd_session_start:${sessionId}`);
                logger.info(`[SESSION] User initiated session end: ${sessionId}`);
            }

        } catch (error) {
            logger.error(`[SESSION] Logging error: ${error.message}`);
        }
    }

    // HANDLE SESSION TIMEOUTS 
    async handleSessionTimeout(sessionId) {
        try {
            await ussdService.logSessionTime(sessionId);
            await ussdService.deleteSession(sessionId);
            logger.info(`[SESSION] Session timeout: ${sessionId}`);
        } catch (error) {
            logger.error(`[SESSION] Timeout handling error: ${error.message}`);
        }
    }

    async validateSessionFreshness(sessionId, msisdn) {
        try {
            const sessionData = await ussdService.getSession(sessionId);
            const sessionStart = await ussdService.redisService.get(`ussd_session_start:${sessionId}`);

            if (sessionStart) {
                const startTime = parseInt(sessionStart);
                const elapsed = Date.now() - startTime;
                const isExpired = elapsed > (ussdService.sessionTimeout * 1000);

                if (isExpired) {
                    logger.warn(`[SESSION] Expired session reused: ${sessionId}, elapsed: ${elapsed}ms`);
                    await this.cleanupSession(sessionId);
                    return false;
                }
            }

            return true;
        } catch (error) {
            logger.error(`[SESSION] Freshness validation error: ${error.message}`);
            return false;
        }
    }

    async cleanupSession(sessionId) {
        try {
            await ussdService.deleteSession(sessionId);
            await ussdService.redisService.del(`ussd_session_start:${sessionId}`);
            logger.info(`[SESSION] Cleaned up session: ${sessionId}`);
        } catch (error) {
            logger.error(`[SESSION] Cleanup error: ${error.message}`);
        }
    }
    async routeToFeature(menu, customer, msisdn, session, shortcode, response, res) {
        const route = this.menuRouting[menu];

        if (!route) {
            logger.error(`[USSD] No route found for menu: ${menu}`);
            // Log session state before error
            await ussdService.logSessionState(session, 'ROUTING_ERROR', menu);
            return this.sendResponse(res, 'end', 'System error. Invalid menu state.');
        }

        logger.info(`[ROUTING DEBUG] Routing from menu: ${menu} to ${route.feature}.${route.method}`);
        logger.info(`[ROUTING DEBUG] Response: "${response}"`);
        logger.info(`[ROUTING DEBUG] Session: ${session}`);

        // ADD SESSION STATE LOGGING
        await ussdService.logSessionState(session, 'ROUTING', menu);

        try {
            return await featureManager.execute(
                route.feature,
                route.method,
                customer,
                msisdn,
                session,
                shortcode,
                response,
                res
            );
        } catch (error) {
            logger.error(`[USSD] Feature routing error [${route.feature}.${route.method}]: ${error.message}`);
            await ussdService.logSessionState(session, 'FEATURE_ERROR', menu);
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again.');
        }
    }

    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');
        logger.info(`[USSD] ${type.toUpperCase()}: ${message}`);
        logger.info(`[USSD] Message size: ${messageSize} bytes`);

        if (type === 'end') {
            logger.info(`[SESSION] End response sent to user`);
        }

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }

    // SHOWS SESSION INFO 
    async getSessionInfo(req, res) {
        const { sessionId } = req.params;
        try {
            const sessionData = await ussdService.getSession(sessionId);
            // FIX: Access redisService correctly
            const sessionStart = await ussdService.redisService.get(`ussd_session_start:${sessionId}`);

            const info = {
                sessionId,
                sessionData,
                sessionStart: sessionStart ? new Date(parseInt(sessionStart)).toISOString() : null,
                elapsed: sessionStart ? Math.floor((Date.now() - parseInt(sessionStart)) / 1000) : 0
            };

            res.json(info);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new USSDController();