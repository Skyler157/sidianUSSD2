const baseFeature = require('./baseFeature');

class FundsTransferFeature extends baseFeature {
    constructor() {
        super();
    }

    async fundstransfer(customer, msisdn, session, shortcode, response, res) {
        if (!response) {
            await this.updateSessionMenu(session, 'fundstransfer', 'mobilebanking');
            return this.displayMenu('fundstransfer', res);
        }

        const menuHandlers = {
            '1': () => this.internaltransfer(customer, msisdn, session, shortcode, null, res), // FIX: pass null as response
            '2': () => this.cardtransfer(customer, msisdn, session, shortcode, null, res),    // FIX: pass null as response  
            '3': () => this.banktransfer(customer, msisdn, session, shortcode, null, res)     // FIX: pass null as response
        };

        return await this.handleMenuFlow('fundstransfer', response, menuHandlers,
            await this.ussdService.getSession(session), msisdn, session, shortcode, res);
    }

    async internaltransfer(customer, msisdn, session, shortcode, response, res) {
        const { internaltransfer } = require('./fundsTransfer/internalTransfer');
        return await internaltransfer(customer, msisdn, session, shortcode, response, res);
    }

    async cardtransfer(customer, msisdn, session, shortcode, response, res) {
        const { cardtransfer } = require('./fundsTransfer/cardTransfer');
        return await cardtransfer(customer, msisdn, session, shortcode, response, res);
    }

    async banktransfer(customer, msisdn, session, shortcode, response, res) {
        const { banktransfer } = require('./fundsTransfer/bankTransfer');
        return await banktransfer(customer, msisdn, session, shortcode, response, res);
    }

    async internaltransferbankaccount(customer, msisdn, session, shortcode, response, res) {
        const { internaltransferbankaccount } = require('./fundsTransfer/internalTransfer');
        return await internaltransferbankaccount(customer, msisdn, session, shortcode, response, res);
    }

    async internaltransferamount(customer, msisdn, session, shortcode, response, res) {
        const { internaltransferamount } = require('./fundsTransfer/internalTransfer');
        return await internaltransferamount(customer, msisdn, session, shortcode, response, res);
    }

    async internaltransferownaccount(customer, msisdn, session, shortcode, response, res) {
        const { internaltransferownaccount } = require('./fundsTransfer/internalTransfer');
        return await internaltransferownaccount(customer, msisdn, session, shortcode, response, res);
    }

    async internaltransferremark(customer, msisdn, session, shortcode, response, res) {
        const { internaltransferremark } = require('./fundsTransfer/internalTransfer');
        return await internaltransferremark(customer, msisdn, session, shortcode, response, res);
    }

    async internaltransfertransaction(customer, msisdn, session, shortcode, response, res) {
        const { internaltransfertransaction } = require('./fundsTransfer/internalTransfer');
        return await internaltransfertransaction(customer, msisdn, session, shortcode, response, res);
    }

    async internaltransferotheraccount(customer, msisdn, session, shortcode, response, res) {
        const { internaltransferotheraccount } = require('./fundsTransfer/internalTransfer');
        return await internaltransferotheraccount(customer, msisdn, session, shortcode, response, res);
    }

    async internaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const { internaltransferbeneficiary } = require('./fundsTransfer/internalTransfer');
        return await internaltransferbeneficiary(customer, msisdn, session, shortcode, response, res);
    }

    async manageinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const { manageinternaltransferbeneficiary } = require('./fundsTransfer/internalTransfer');
        return await manageinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res);
    }

    async cardnumber(customer, msisdn, session, shortcode, response, res) {
        const { cardnumber } = require('./fundsTransfer/cardTransfer');
        return await cardnumber(customer, msisdn, session, shortcode, response, res);
    }

    async cardamount(customer, msisdn, session, shortcode, response, res) {
        const { cardamount } = require('./fundsTransfer/cardTransfer');
        return await cardamount(customer, msisdn, session, shortcode, response, res);
    }

    async cardbankaccount(customer, msisdn, session, shortcode, response, res) {
        const { cardbankaccount } = require('./fundsTransfer/cardTransfer');
        return await cardbankaccount(customer, msisdn, session, shortcode, response, res);
    }

    async cardremark(customer, msisdn, session, shortcode, response, res) {
        const { cardremark } = require('./fundsTransfer/cardTransfer');
        return await cardremark(customer, msisdn, session, shortcode, response, res);
    }

    async cardtransaction(customer, msisdn, session, shortcode, response, res) {
        const { cardtransaction } = require('./fundsTransfer/cardTransfer');
        return await cardtransaction(customer, msisdn, session, shortcode, response, res);
    }

    async bankfilter(customer, msisdn, session, shortcode, response, res) {
        const { bankfilter } = require('./fundsTransfer/bankTransfer');
        return await bankfilter(customer, msisdn, session, shortcode, response, res);
    }

    async banklist(customer, msisdn, session, shortcode, response, res) {
        const { banklist } = require('./fundsTransfer/bankTransfer');
        return await banklist(customer, msisdn, session, shortcode, response, res);
    }

    async bankbranch(customer, msisdn, session, shortcode, response, res) {
        const { bankbranch } = require('./fundsTransfer/bankTransfer');
        return await bankbranch(customer, msisdn, session, shortcode, response, res);
    }

    async bankbranchlist(customer, msisdn, session, shortcode, response, res) {
        const { bankbranchlist } = require('./fundsTransfer/bankTransfer');
        return await bankbranchlist(customer, msisdn, session, shortcode, response, res);
    }

    async banktrasferaccount(customer, msisdn, session, shortcode, response, res) {
        const { banktrasferaccount } = require('./fundsTransfer/bankTransfer');
        return await banktrasferaccount(customer, msisdn, session, shortcode, response, res);
    }

    async banktrasfername(customer, msisdn, session, shortcode, response, res) {
        const { banktrasfername } = require('./fundsTransfer/bankTransfer');
        return await banktrasfername(customer, msisdn, session, shortcode, response, res);
    }

    async banktrasfermount(customer, msisdn, session, shortcode, response, res) {
        const { banktrasfermount } = require('./fundsTransfer/bankTransfer');
        return await banktrasfermount(customer, msisdn, session, shortcode, response, res);
    }

    async banktrasferbankaccount(customer, msisdn, session, shortcode, response, res) {
        const { banktrasferbankaccount } = require('./fundsTransfer/bankTransfer');
        return await banktrasferbankaccount(customer, msisdn, session, shortcode, response, res);
    }

    async banktrasferremark(customer, msisdn, session, shortcode, response, res) {
        const { banktrasferremark } = require('./fundsTransfer/bankTransfer');
        return await banktrasferremark(customer, msisdn, session, shortcode, response, res);
    }

    async banktrasfertransaction(customer, msisdn, session, shortcode, response, res) {
        const { banktrasfertransaction } = require('./fundsTransfer/bankTransfer');
        return await banktrasfertransaction(customer, msisdn, session, shortcode, response, res);
    }

    // Beneficiary management methods
    async addinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const { addinternaltransferbeneficiary } = require('./fundsTransfer/internalTransfer');
        return await addinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res);
    }

    async addinternaltransferbeneficiaryname(customer, msisdn, session, shortcode, response, res) {
        const { addinternaltransferbeneficiaryname } = require('./fundsTransfer/internalTransfer');
        return await addinternaltransferbeneficiaryname(customer, msisdn, session, shortcode, response, res);
    }

    async addinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res) {
        const { addinternaltransferbeneficiarytransaction } = require('./fundsTransfer/internalTransfer');
        return await addinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res);
    }

    async viewinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const { viewinternaltransferbeneficiary } = require('./fundsTransfer/internalTransfer');
        return await viewinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res);
    }

    async viewinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res) {
        const { viewinternaltransferbeneficiarytransaction } = require('./fundsTransfer/internalTransfer');
        return await viewinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res);
    }

    async deleteinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res) {
        const { deleteinternaltransferbeneficiary } = require('./fundsTransfer/internalTransfer');
        return await deleteinternaltransferbeneficiary(customer, msisdn, session, shortcode, response, res);
    }

    async deleteinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res) {
        const { deleteinternaltransferbeneficiarytransaction } = require('./fundsTransfer/internalTransfer');
        return await deleteinternaltransferbeneficiarytransaction(customer, msisdn, session, shortcode, response, res);
    }
}

module.exports = new FundsTransferFeature();