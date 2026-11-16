((root) => {
  const fields = typeof module === 'object' && module.exports ? require('./customer-fields') : root.CustomerFields;
  function createCustomerSession(storage, clock = Date.now) {
    const key = 'cadastro-customer';
    const clear = () => { try { storage.removeItem(key); } catch {} };
    return {
      clear,
      read() {
        try {
          const entry = JSON.parse(storage.getItem(key));
          const customer = fields.customerData(entry?.customer);
          if (!customer || !Number.isFinite(entry.expiresAt) || clock() >= entry.expiresAt || entry.expiresAt > clock() + 30 * 60000) { clear(); return null; }
          return customer;
        } catch { clear(); return null; }
      },
      save(input) {
        const customer = fields.customerData(input);
        if (!customer) throw new Error('Confira nome completo, CPF/CNPJ, e-mail e telefone com DDD.');
        storage.setItem(key, JSON.stringify({ customer, expiresAt: clock() + 30 * 60000 }));
        return customer;
      }
    };
  }
  if (typeof module === 'object' && module.exports) module.exports = createCustomerSession;
  else {
    let storage;
    try { storage = root.sessionStorage; } catch {}
    root.CadastroSession = createCustomerSession(storage);
  }
})(typeof window === 'object' ? window : globalThis);
