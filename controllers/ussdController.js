const featureManager = require('../features');
const logger = require('../services/logger');

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
            'managewithdrawbeneficiary': { feature: 'beneficiaryService', method: 'manageMpesaBeneficiaries' },
            'addwithdrawbeneficiary': { feature: 'beneficiaryService', method: 'addMpesaBeneficiary' },
            'addwithdrawbeneficiaryname': { feature: 'beneficiaryService', method: 'addwithdrawbeneficiaryname' },
            'addwithdrawbeneficiaryconfirm': { feature: 'beneficiaryService', method: 'addwithdrawbeneficiaryconfirm' },
            'viewwithdrawbeneficiaries': { feature: 'beneficiaryService', method: 'viewMpesaBeneficiaries' },
            'deletewithdrawbeneficiary': { feature: 'beneficiaryService', method: 'deleteMpesaBeneficiary' },
            'deletebeneficiaryconfirm': { feature: 'beneficiaryService', method: 'deletebeneficiaryconfirm' },

            // Mobile Money
            'withdraw': { feature: 'mobileMoney', method: 'withdraw' },
            'withdrawmsisdn': { feature: 'mobileMoney', method: 'withdrawmsisdn' },
            'withdrawamount': { feature: 'mobileMoney', method: 'withdrawamount' },
            'withdrawbankaccount': { feature: 'mobileMoney', method: 'withdrawbankaccount' },
            'withdrawconfirm': { feature: 'mobileMoney', method: 'withdrawconfirm' },
            'withdrawpin': { feature: 'mobileMoney', method: 'withdrawpin' },

            // Deposit routes
            'deposit': { feature: 'mobileMoney', method: 'deposit' },
            'depositbankaccount': { feature: 'mobileMoney', method: 'depositbankaccount' },
            'depositconfirm': { feature: 'mobileMoney', method: 'depositconfirm' },

            // Beneficiary management routes
            'managewithdrawbeneficiary': { feature: 'mobileMoney', method: 'managewithdrawbeneficiary' },
            'addwithdrawbeneficiary': { feature: 'mobileMoney', method: 'addwithdrawbeneficiary' },
            'addwithdrawbeneficiaryname': { feature: 'mobileMoney', method: 'addwithdrawbeneficiaryname' },
            'addwithdrawbeneficiaryconfirm': { feature: 'mobileMoney', method: 'addwithdrawbeneficiaryconfirm' },

            // Other Services
            'airtime': { feature: 'airtime', method: 'airtime' },
            'fundstransfer': { feature: 'fundsTransfer', method: 'fundstransfer' },
            'billpayment': { feature: 'billPayment', method: 'billpayment' },
            'paymerchant': { feature: 'merchantPayment', method: 'paymerchant' },

            // New Features
            'termdeposits': { feature: 'termDeposits', method: 'termdeposits' },
            'termdepositstenure': { feature: 'termDeposits', method: 'termdepositstenure' },
            'termdepositsamount': { feature: 'termDeposits', method: 'termdepositsamount' },
            'termdepositsbankaccount': { feature: 'termDeposits', method: 'termdepositsbankaccount' },
            'termdepositstransaction': { feature: 'termDeposits', method: 'termdepositstransaction' },

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
            const ussdService = require('../services/ussdService');
            const sessionData = await ussdService.getSession(sessionId);

            if (!sessionData) {
                return await this.routeToFeature('home', null, msisdn, sessionId, shortcode, response, res);
            }

            const currentMenu = sessionData.current_menu || 'home';
            const customer = sessionData.customer || null;

            return await this.routeToFeature(currentMenu, customer, msisdn, sessionId, shortcode, response, res);
        } catch (error) {
            logger.error(`[USSD] Handler Error: ${error.message}`);
            return this.sendResponse(res, 'end', 'System error. Please try again later.');
        }
    }

    async routeToFeature(menu, customer, msisdn, session, shortcode, response, res) {
        const route = this.menuRouting[menu];

        if (!route) {
            logger.error(`[USSD] No route found for menu: ${menu}`);
            return this.sendResponse(res, 'end', 'System error. Invalid menu state.');
        }

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
            return this.sendResponse(res, 'end', 'Service temporarily unavailable. Please try again.');
        }
    }

    sendResponse(res, type, message) {
        const messageSize = Buffer.byteLength(message, 'utf8');
        logger.info(`[USSD] ${type.toUpperCase()}: ${message}`);
        logger.info(`[USSD] Message size: ${messageSize} bytes`);

        res.set('Content-Type', 'text/plain');
        return res.send(message);
    }
}

module.exports = new USSDController();