const logger = require('../services/logger');

class FeatureManager {
    constructor() {
        this.features = new Map();
        this.loadFeatures();
    }

    loadFeatures() {
        try {
            // Load all feature modules
            const features = {
                'authentication': require('./authentication'),
                'navigation': require('./navigation'),
                'accountServices': require('./accountServices'),
                'balanceService': require('./balance'),
                'statementService': require('./statement'),
                'beneficiaryService': require('./beneficiary'),
                'mobileMoney': require('./mobilemoney'),
                'buyfloat': require('./buyfloat'),
                'buygoods': require('./buygoods'),
                'paybill': require('./paybill'),
                'airtime': require('./airtime'),
                'fundsTransfer': require('./fundsTransfer'),
                'billPayment': require('./billPayment'),
                'merchantPayment': require('./merchantPayment'),
                'pesalink': require('./pesalink'),
                'termDeposits': require('./termDeposits'),
                'pinManagement': require('./pinManagement')
            };

            Object.entries(features).forEach(([name, feature]) => {
                this.features.set(name, feature);
            });

        } catch (error) {
            logger.error(`[FEATURES] Loading error: ${error.message}`);
        }
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