const { createHmac } = require('node:crypto');
const { gatewayRequest } = require('./payments');
const AMOUNT = 5698;
const DESCRIPTION = 'Cadastro do cliente no despachante — taxa única';
const digits = value => typeof value === 'string' ? value.replace(/\D/g, '') : '';
function validDocument(value) {
  const number = digits(value);
  if (!/^(\d{11}|\d{14})$/.test(number) || /^(\d)\1+$/.test(number)) return false;
  if (number.length === 11) {
    for (let length = 9; length <= 10; length++) {
      const sum = [...number.slice(0, length)].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
      const check = (sum * 10) % 11 % 10;
      if (check !== Number(number[length])) return false;
    }
  } else {
    for (let length = 12; length <= 13; length++) {
      let weight = length - 7;
      const sum = [...number.slice(0, length)].reduce((total, digit) => {
        const next = total + Number(digit) * weight--;
        if (weight === 1) weight = 9;
        return next;
      }, 0);
      const remainder = sum % 11;
      if ((remainder < 2 ? 0 : 11 - remainder) !== Number(number[length])) return false;
    }
  }
  return true;
}
function customerData(input) {
  if (!input || typeof input.name !== 'string' || typeof input.email !== 'string') return null;
  const name = input.name.trim().replace(/\s+/g, ' ');
  const email = input.email.trim();
  const document = digits(input.document);
  const phone = digits(input.phone);
  if (name.length < 3 || name.length > 120 || !name.includes(' ') || /[<>\u0000-\u001f]/.test(name)) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validDocument(document) || !/^\d{10,11}$/.test(phone)) return null;
  return { name, email, document, phone };
}
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
