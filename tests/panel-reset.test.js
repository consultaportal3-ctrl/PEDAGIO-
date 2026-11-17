const { test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/panel-reset');
const { sessionCookie, day, TTL } = require('../lib/visits');
const { transactionCommand } = require('../lib/payments');

test('today reset requires login, same origin and explicit current-day confirmation', async () => {
  const names = ['PANEL_PASSWORD', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const previous = names.map(name => process.env[name]);
  const oldFetch = global.fetch;
  process.env.PANEL_PASSWORD = 'test-panel-password';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const calls = [];
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, json: async () => [{ result: 1 }] };
  };
  const today = day(new Date());
  const body = { confirm: 'clear-today', date: today };
  async function request(overrides = {}) {
    const req = { method: 'POST', body, headers: { host: 'site.example', origin: 'https://site.example', cookie: sessionCookie().split(';')[0] }, ...overrides };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await handler(req, res);
    return res;
  }
  try {
    assert.equal((await request({ method: 'GET' })).code, 405);
    assert.equal((await request({ headers: {} })).code, 401);
    const headers = { host: 'site.example', cookie: sessionCookie().split(';')[0] };
    assert.equal((await request({ headers })).code, 403);
    assert.equal((await request({ headers: { ...headers, origin: 'https://other.example' } })).code, 403);
    assert.equal((await request({ body: {} })).code, 400);
    assert.equal((await request({ body: { ...body, date: '2000-01-01' } })).code, 400);
    assert.equal((await request({ body: '{invalid' })).code, 400);
    assert.equal(calls.length, 0);
    const result = await request({ body: JSON.stringify(body) });
    assert.equal(result.code, 200);
    assert.equal(result.body.date, today);
    const command = calls[0][0];
    assert.equal(command[0], 'EVAL');
    assert.equal(command[2], 6);
    assert.deepEqual(command.slice(3, 9), [`visits:day:${today}`, `visits:access:${today}`, `visits:geo:${today}`, `payments:day:${today}`, `payments:day:${today}:cleared-at`, 'visits:last']);
    assert.equal(command.at(-1), TTL);
    const stamp = new Date().toISOString();
    const save = transactionCommand({ id: 'test', date: today, createdAt: stamp, updatedAt: stamp });
    assert.ok(save[1].indexOf(':cleared-at') < save[1].indexOf("redis.call('HSET'"));
    global.fetch = async () => { throw new Error('offline'); };
    assert.equal((await request()).code, 503);
  } finally {
    global.fetch = oldFetch;
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
  }
});
