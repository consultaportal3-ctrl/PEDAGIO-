const { createHmac } = require('node:crypto');
const { gatewayRequest } = require('./payments');
const AMOUNT = 5698;
const DESCRIPTION = 'Cadastro do cliente no despachante — taxa única';
const { digits, validDocument, customerData } = require('../customer-fields');
function checkoutToken(reference) {
  return createHmac('sha256', process.env.PINGUPAG_WEBHOOK_SECRET).update(`checkout:${reference}`).digest('hex');
}
async function sellerDetails() {
  const seller = await gatewayRequest('/gateway/v1/seller');
  const name = typeof seller.company_name === 'string' && seller.company_name.trim() ? seller.company_name.trim() : seller.name;
  const document = digits(seller.document);
  if (typeof name !== 'string' || !name.trim() || !validDocument(document) || typeof seller.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seller.email)) throw new Error('Seller identity unavailable');
  return { name: name.trim().slice(0, 200), document: document.length === 14 ? document : `${document.slice(0, 3)}.***.***-${document.slice(-2)}`, email: seller.email };
}
module.exports = { AMOUNT, DESCRIPTION, customerData, checkoutToken, sellerDetails, validDocument };
