const { test } = require('node:test');
const assert = require('node:assert/strict');
const createSession = require('../cadastro-session');

test('customer draft is validated, isolated by tab, expires and can be cleared after generation', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  let now = 1000000;
  const session = createSession(storage, () => now);
  const customer = { name: 'Cliente Exemplo', email: 'cliente@example.com', document: '529.982.247-25', phone: '(11) 99999-9999' };
  assert.equal(session.read(), null);
  session.save(customer);
  assert.equal(session.read().document, '52998224725');
  assert.equal(session.read().phone, '11999999999');
  assert.throws(() => session.save({ ...customer, document: '11111111111' }));
  assert.equal(createSession({ getItem() { return null; }, removeItem() {} }, () => now).read(), null);
  now += 30 * 60000;
  assert.equal(session.read(), null);
  assert.equal(values.size, 0);
  session.save(customer);
  session.clear();
  assert.equal(session.read(), null);
  values.set('cadastro-customer', '{invalid');
  assert.equal(session.read(), null);
  assert.equal(values.size, 0);
  assert.equal(createSession(undefined).read(), null);
});
