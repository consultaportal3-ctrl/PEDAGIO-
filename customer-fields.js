((root) => {
  const digits = value => typeof value === 'string' ? value.replace(/\D/g, '') : '';
  function validDocument(value) {
    const number = digits(value);
    if (!/^(\d{11}|\d{14})$/.test(number) || /^(\d)\1+$/.test(number)) return false;
    for (let length = number.length - 2; length < number.length; length++) {
      let sum = 0;
      if (number.length === 11) {
        sum = [...number.slice(0, length)].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
        if ((sum * 10) % 11 % 10 !== Number(number[length])) return false;
      } else {
        let weight = length - 7;
        sum = [...number.slice(0, length)].reduce((total, digit) => { const next = total + Number(digit) * weight--; if (weight === 1) weight = 9; return next; }, 0);
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
  const fields = { digits, validDocument, customerData };
  if (typeof module === 'object' && module.exports) module.exports = fields;
  else root.CustomerFields = fields;
})(typeof window === 'object' ? window : globalThis);
