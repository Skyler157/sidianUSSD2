const logger = require('../services/logger');

class FeatureManager {
    constructor() {
        this.features = new Map();
        this.loadFeatures();
    }

    loadFeatures() {
        try {
            // Load all feature modules
            this.features.set('authentication', require('./authentication'));
            this.features.set('navigation', require('./navigation'));
            this.features.set('accountServices', require('./accountServices'));
            this.features.set('balanceService', require('./balance'));
            this.features.set('statementService', require('./statement'));
            this.features.set('beneficiaryService', require('./beneficiary'));
            this.features.set('mobileMoney', require('./mobilemoney'));
            this.features.set('airtime', require('./airtime'));
            this.features.set('fundsTransfer', require('./fundstransfer'));
            this.features.set('billPayment', require('./billPayment'));
            this.features.set('merchantPayment', require('./merchantPayment'));
            this.features.set('termDeposits', require('./termDeposits'));
            this.features.set('pinManagement', require('./pinManagement'));

            logger.info(`[FEATURES] Loaded ${this.features.size} features successfully`);
        } catch (error) {
            logger.error(`[FEATURES] Loading error: ${error.message}`);
        }
    }

    isReady() {
        return this.features.size > 0;
    }

    getFeature(featureName) {
        const feature = this.features.get(featureName);
        if (!feature) {
            throw new Error(`Feature not found: ${featureName}`);
        }
        return feature;
    }

    async execute(featureName, method, ...args) {
        try {
            const feature = this.getFeature(featureName);

            if (typeof feature[method] !== 'function') {
                throw new Error(`Method ${method} not found in feature ${featureName}`);
            }

            return await feature[method](...args);
        } catch (error) {
            logger.error(`[FEATURES] Execution error [${featureName}.${method}]: ${error.message}`);
            throw error;
        }
    }
}

module.exports = new FeatureManager();