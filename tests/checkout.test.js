const { test } = require('node:test');
const assert = require('node:assert/strict');
const checkout = require('../api/checkout');
const { customerData, validDocument } = require('../lib/checkout');

test('payer validation rejects invalid CPF/CNPJ, phone and incomplete names', () => {
  assert.equal(validDocument('529.982.247-25'), true);
  assert.equal(validDocument('11.444.777/0001-61'), true);
  assert.equal(validDocument('111.111.111-11'), false);
  assert.equal(validDocument('52998224726'), false);
  assert.equal(customerData({ name: 'João', email: 'test@example.com', phone: '11999999999', document: '52998224725' }), null);
});

test('checkout fixes price, identifies seller, registers generation and prevents duplicate requests', async () => {
  const oldFetch = global.fetch;
  const names = ['PINGUPAG_API_KEY', 'PINGUPAG_WEBHOOK_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL'];
  const oldValues = names.map(key => process.env[key]);
  process.env.PINGUPAG_API_KEY = 'private-api-key';
  process.env.PINGUPAG_WEBHOOK_SECRET = 's'.repeat(32);
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'private-redis-token';
  process.env.VERCEL = '1';
  const store = new Map();
  const transactions = [];
  let creations = 0;
  let posted = null;
  let ambiguousFailure = false;
  let explicitRejection = false;
  global.fetch = async (input, options) => {
    const url = new URL(input);
    if (url.host === 'redis.example') {
      const results = JSON.parse(options.body).map(command => {
        const [type, key, value, ...args] = command;
        if (type === 'GET') return { result: store.get(key) || null };
        if (type === 'INCR') { const count = Number(store.get(key) || 0) + 1; store.set(key, count); return { result: count }; }
        if (type === 'SET') { if (args.includes('NX') && store.has(key)) return { result: null }; store.set(key, value); return { result: 'OK' }; }
        if (type === 'DEL') { store.delete(key); return { result: 1 }; }
        if (type === 'EVAL') transactions.push(command);
        return { result: 1 };
      });
      return { ok: true, json: async () => results };
    }
    assert.equal(options.headers['X-API-Key'], 'private-api-key');
    if (url.pathname.endsWith('/seller')) return { ok: true, json: async () => ({ name: 'Prestador Exemplo', document: '11444777000161', email: 'atendimento@example.com' }) };
    if (url.pathname.endsWith('/transaction')) {
      creations++;
      posted = JSON.parse(options.body);
      if (ambiguousFailure) throw new Error('timeout after sending');
      if (explicitRejection) return { ok: false, status: 400 };
      return { ok: true, json: async () => ({ status: 'success', transaction_id: 77, amount: 5698, qr_code: '000201-CODIGO-DE-TESTE' }) };
    }
    const stamp = new Date().toISOString();
    return { ok: true, json: async () => [{ id: 'obfuscated-id', external_id: posted.reference, status: 'approved', amount: 5698, created_at: stamp, updated_at: stamp }] };
  };
  async function request(method, body, query = {}, authorization = '', origin = 'https://pedagio-digital.online') {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await checkout({ method, body, query, headers: { host: 'pedagio-digital.online', origin, authorization, 'x-forwarded-for': '203.0.113.20' } }, res);
    return res;
  }
  try {
    const offer = await request('GET');
    assert.equal(offer.body.seller.name, 'Prestador Exemplo');
    assert.equal(offer.body.amount, 5698);
    const body = { requestId: '550e8400-e29b-41d4-a716-446655440000', amount: 1, accepted: true, sellerName: offer.body.seller.name, customer: { name: 'Cliente Exemplo', email: 'cliente@example.com', document: '52998224725', phone: '11999999999' } };
    assert.equal((await request('POST', body, {}, '', 'https://other.example')).code, 403);
    assert.equal((await request('POST', { ...body, accepted: false })).code, 400);
    const created = await request('POST', body);
    assert.equal(created.code, 201);
    assert.equal(posted.amount, 5698);
    assert.match(posted.description, /Cadastro do cliente no despachante/);
    assert.equal(new URL(posted.postback_url).searchParams.get('key'), 's'.repeat(32));
    assert.equal(created.body.status, 'pending');
    assert.equal(transactions.length, 1);
    const savedRow = JSON.parse(transactions[0][5]);
    assert.equal(savedRow.id, `CAD_${body.requestId}`);
    assert.equal(savedRow.amount, 5698);
    assert.equal(JSON.stringify([...store.values()]).includes('cliente@example.com'), false);
    assert.equal((await request('POST', body)).code, 200);
    assert.equal(creations, 1);
    assert.equal((await request('GET', null, { reference: created.body.reference }, 'Bearer wrong')).code, 403);
    const status = await request('GET', null, { reference: created.body.reference }, `Bearer ${created.body.token}`);
    assert.equal(status.body.status, 'approved');
    assert.equal(JSON.parse(transactions[1][5]).id, savedRow.id);
    ambiguousFailure = true;
    const another = { ...body, requestId: '550e8400-e29b-41d4-a716-446655440001' };
    assert.equal((await request('POST', another)).code, 503);
    assert.equal((await request('POST', another)).code, 409);
    assert.equal(creations, 2);
    ambiguousFailure = false;
    explicitRejection = true;
    const rejected = { ...body, requestId: '550e8400-e29b-41d4-a716-446655440002' };
    assert.equal((await request('POST', rejected)).code, 503);
    explicitRejection = false;
    assert.equal((await request('POST', rejected)).code, 201);
    assert.equal(creations, 4);
  } finally {
    global.fetch = oldFetch;
    names.forEach((key, i) => { if (oldValues[i] === undefined) delete process.env[key]; else process.env[key] = oldValues[i]; });
  }
});
