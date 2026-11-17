const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTransaction, paymentSummary } = require('../lib/payments');
const webhook = require('../api/pingupag-webhook');
const endpoint = require('../api/payments');
const { sessionCookie, day } = require('../lib/visits');

test('today payment filter excludes preserved historical buckets', async () => {
  const names = ['PANEL_PASSWORD', 'PINGUPAG_API_KEY', 'PINGUPAG_WEBHOOK_SECRET', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const saved = names.map(name => process.env[name]);
  const oldFetch = global.fetch;
  Object.assign(process.env, { PANEL_PASSWORD: 'test-password', PINGUPAG_API_KEY: 'test-key', PINGUPAG_WEBHOOK_SECRET: 's'.repeat(32), UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' });
  const today = day(new Date());
  const stamp = new Date(Date.now() - 86400000).toISOString();
  const historical = JSON.stringify({ id: 'old-payment', status: 'approved', amount: 5698, createdAt: stamp, updatedAt: stamp });
  const calls = [];
  global.fetch = async (_url, options) => {
    const commands = JSON.parse(options.body);
    calls.push(commands);
    return { ok: true, json: async () => commands.map(([, key]) => ({ result: key.endsWith(today) ? [] : [historical] })) };
  };
  try {
    async function request(days) {
      const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
      await endpoint({ method: 'GET', headers: { cookie: sessionCookie().split(';')[0] }, query: { days } }, res);
      return res;
    }
    const todayResult = await request(1);
    assert.equal(todayResult.code, 200);
    assert.equal(todayResult.body.generated, 0);
    assert.deepEqual(calls[0], [['HVALS', `payments:day:${today}`]]);
    const week = await request(7);
    assert.equal(week.body.generated, 6);
    assert.equal(week.body.amountPaid, 6 * 5698);
  } finally {
    global.fetch = oldFetch;
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});

test('financial totals follow verified status, integer cents and reject old/invalid records', () => {
  const stamp = new Date().toISOString();
  const row = normalizeTransaction({ id: 'tx-1', status: 'approved', amount: 5698, created_at: stamp, updated_at: stamp, customer_data: { document: 'not-stored' } });
  assert.equal(row.amount, 5698);
  assert.equal(row.customer_data, undefined);
  assert.equal(normalizeTransaction({ ...row, amount: '5698', created_at: stamp, updated_at: stamp }), null);
  assert.equal(normalizeTransaction({ ...row, created_at: '2020-01-01', updated_at: stamp }), null);
  const summary = paymentSummary([[JSON.stringify(row), JSON.stringify({ ...row, id: 'tx-2', status: 'refunded' }), JSON.stringify({ ...row, id: 'tx-3', status: 'pending' })]]);
  assert.equal(summary.generated, 3);
  assert.equal(summary.amountGenerated, 17094);
  assert.equal(summary.paid, 1);
  assert.equal(summary.amountPaid, 5698);
  assert.equal(paymentSummary([]).amountGenerated, 0);
  const many = paymentSummary([Array.from({ length: 101 }, (_, i) => JSON.stringify({ ...row, id: `tx-${i}`, amount: 100 + i }))]);
  assert.equal(many.recent.length, 100);
  assert.equal(many.amountGenerated, 15150);
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
