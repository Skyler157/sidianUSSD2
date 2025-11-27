const axios = require('axios');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

class ApiService {
    constructor() {
        this.endpoint = process.env.USSD_ENDPOINT;
        this.bankId = process.env.BANK_ID;
        this.bankName = process.env.BANK_NAME;
        this.shortcode = process.env.SHORTCODE;
        this.country = process.env.COUNTRY;
        this.trxSource = process.env.TRX_SOURCE;
    }

    generateUniqueId() {
        return uuidv4();
    }

    getDeviceId(msisdn, shortcode) {
        return `${msisdn}${shortcode}`;
    }

    parseResponse(response) {
        logger.info(`RAW RESPONSE: ${response}`);

        // Handle XML response
        if (response.includes('<string xmlns="http://tempuri.org/">')) {
            const start = response.indexOf('<string xmlns="http://tempuri.org/">') + '<string xmlns="http://tempuri.org/">'.length;
            const end = response.indexOf('</string>');
            response = response.substring(start, end);
        }

        // Clean the response - remove any non-printable characters
        response = response.replace(/[^\x20-\x7E]/g, '');

        logger.info(`CLEANED RESPONSE: ${response}`);

        if (response.startsWith('000:')) {
            return { STATUS: '000', DATA: 'Deposit initiated successfully' };
        }

        // Handle specific error responses
        if (response.trim() === '-)' || response.length < 3) {
            logger.error(`API returned error response: ${response}`);
            return { STATUS: '999', DATA: 'Transaction failed. Please try again later.' };
        }

        if (!response.includes(':')) {
            logger.error(`API returned malformed response: ${response}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }

        const parts = response.split(':');
        const result = {};

        for (let i = 0; i < parts.length; i += 2) {
            if (parts[i + 1] !== undefined) {
                result[parts[i]] = parts[i + 1];
            }
        }

        return result;
    }

    async makeRequest(service, data, msisdn, session, shortcode) {
        const uniqueId = this.generateUniqueId();
        const deviceId = this.getDeviceId(msisdn, shortcode);
        const formData =
            `FORMID:${service}:` +
            `${data}${data ? ':' : ''}` +
            `MOBILENUMBER:${msisdn}:` +
            `SESSION:${session}:` +
            `BANKID:${this.bankId}:` +
            `BANKNAME:${this.bankName}:` +
            `SHORTCODE:${shortcode}:` +
            `COUNTRY:${this.country}:` +
            `TRXSOURCE:${this.trxSource}:` +
            `DEVICEID:${deviceId}:` +
            `UNIQUEID:${uniqueId}:`;

        logger.info(`REQUEST [${service}]: ${formData}`);

        try {
            const requestUrl = `${this.endpoint}?b=${formData}`;
            logger.info(`REQUEST URL [${service}]: ${requestUrl}`);

            const response = await axios.get(requestUrl, {
                timeout: 30000
            });

            logger.info(`RESPONSE [${service}]: ${response.data}`);
            return this.parseResponse(response.data);

        } catch (err) {
            logger.error(`API Request Failed: ${err.message}`);
            return { STATUS: '999', DATA: 'Service temporarily unavailable' };
        }
    }
}

module.exports = new ApiService();