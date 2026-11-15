const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTransaction, paymentSummary } = require('../lib/payments');
const webhook = require('../api/pingupag-webhook');
const endpoint = require('../api/payments');

test('financial totals follow verified status, integer cents and reject old/invalid records', () => {
  const stamp = new Date().toISOString();
  const row = normalizeTransaction({ id: 'tx-1', status: 'approved', amount: 5698, created_at: stamp, updated_at: stamp, customer_data: { document: 'not-stored' } });
  assert.equal(row.amount, 5698);
  assert.equal(row.customer_data, undefined);
  assert.equal(normalizeTransaction({ ...row, amount: '5698', created_at: stamp, updated_at: stamp }), null);
  assert.equal(normalizeTransaction({ ...row, created_at: '2020-01-01', updated_at: stamp }), null);
  const summary = paymentSummary([[JSON.stringify(row), JSON.stringify({ ...row, id: 'tx-2', status: 'refunded' }), JSON.stringify({ ...row, id: 'tx-3', status: 'pending' })]]);
  assert.equal(summary.generated, 3);
  assert.equal(summary.paid, 1);
  assert.equal(summary.amountPaid, 5698);
});

test('webhook rejects forgeries, verifies with gateway, and reuses transaction ID on retries', async () => {
  const oldFetch = global.fetch;
  const names = ['PINGUPAG_API_KEY', 'PINGUPAG_WEBHOOK_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const previous = names.map(key => process.env[key]);
  process.env.PINGUPAG_API_KEY = 'private-api-key';
  process.env.PINGUPAG_WEBHOOK_SECRET = 's'.repeat(32);
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'private-redis-token';
  const commands = [];
  let calls = 0;
  const stamp = new Date().toISOString();
  const res = () => ({ code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } });
  global.fetch = async (url, options) => {
    calls++;
    if (String(url).includes('/gateway/')) {
      assert.equal(options.headers['X-API-Key'], 'private-api-key');
      assert.equal(new URL(url).searchParams.get('external_id'), 'ref-1');
      return { ok: true, json: async () => [{ id: 123, external_id: 'ref-1', status: 'pending', amount: 1000, created_at: stamp, updated_at: stamp }] };
    }
    const batch = JSON.parse(options.body);
    commands.push(batch);
    return { ok: true, json: async () => batch.map(() => ({ result: 1 })) };
  };
  try {
    let response = res();
    await endpoint({ method: 'GET', headers: {}, query: {} }, response);
    assert.equal(response.code, 401);
    response = res();
    await webhook({ method: 'POST', query: { key: 'wrong' }, body: { external_id: 'ref-1' } }, response);
    assert.equal(response.code, 403);
    assert.equal(calls, 0);
    const request = { method: 'POST', query: { key: 's'.repeat(32) }, body: { external_id: 'ref-1', status: 'approved', amount: 999999 } };
    for (let i = 0; i < 2; i++) {
      response = res();
      await webhook(request, response);
      assert.equal(response.code, 200);
    }
    const row = JSON.parse(commands[0][0][5]);
    assert.equal(row.status, 'pending');
    assert.equal(row.amount, 1000);
    assert.equal(commands[0][0][4], commands[1][0][4]);
    assert.equal(commands[0][0][0], 'EVAL');
    global.fetch = async () => ({ ok: false });
    response = res();
    await webhook(request, response);
    assert.equal(response.code, 503);
    assert.equal(commands.length, 2);
  } finally {
    global.fetch = oldFetch;
    names.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
  }
});
