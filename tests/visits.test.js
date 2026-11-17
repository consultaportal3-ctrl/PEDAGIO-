const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const handler = require('../api/visits');
const { day, redis, VisitStoreError } = require('../lib/visits');
const { accessRecord, summarizeLocations, recentAccess } = require('../lib/access');

test('protected statistics, login, anonymous recording, periods and failures', async () => {
  const oldFetch = global.fetch;
  process.env.PANEL_PASSWORD = 'test-password-for-panel';
  process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  const calls = [];
  global.fetch = async (_url, options) => {
    const commands = JSON.parse(options.body);
    calls.push(commands);
    return { ok: true, json: async () => commands.map(([command, ...args]) => ({ result: command === 'MGET' ? args.map(() => '2') : command === 'GET' ? '2026-11-15T12:00:00Z' : 1 })) };
  };
  async function request(method, body, cookie, query = {}, origin = 'https://site.example') {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await handler({ method, body, headers: { host: 'site.example', origin, cookie }, query }, res);
    return res;
  }
  try {
    assert.equal((await request('GET')).code, 401);
    assert.equal(calls.length, 0);
    assert.equal((await request('POST', { action: 'visit' }, null, {}, 'https://other.example')).code, 403);
    assert.equal((await request('POST', { action: 'login', password: 'wrong' })).code, 401);
    const login = await request('POST', { action: 'login', password: process.env.PANEL_PASSWORD });
    assert.equal(login.code, 200);
    const cookie = login.headers['Set-Cookie'].split(';')[0];
    assert.match(login.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Strict/);
    const stats = await request('GET', null, cookie);
    assert.equal(stats.code, 200);
    assert.equal(stats.body.total, 14);
    assert.equal(stats.body.today, 2);
    assert.equal((await request('GET', null, cookie, { days: 1 })).body.total, 2);
    assert.deepEqual(stats.body.recent, []);
    assert.deepEqual(stats.body.locations, []);
    assert.equal((await request('GET', null, cookie, { days: 30 })).body.total, 60);
    assert.equal((await request('GET', null, cookie, { days: 9999 })).code, 400);
    assert.equal((await request('GET', null, cookie + 'tampered')).code, 401);
    assert.equal((await request('POST', { action: 'visit', plate: 'ignored' })).code, 204);
    assert.equal(JSON.stringify(calls.at(-1)).includes('ignored'), false);
    const detailCommands = calls.at(-1);
    assert.equal(detailCommands.find(command => command[0] === 'EXPIRE' && command[1].startsWith('visits:access:'))[2], 7 * 86400);
    assert.deepEqual(detailCommands.find(command => command[0] === 'LTRIM').slice(2), [0, 99]);
    assert.equal((await request('DELETE')).code, 204);
    global.fetch = async () => { throw new Error('offline'); };
    assert.equal((await request('GET', null, cookie)).code, 503);
    assert.equal(day(new Date('2026-11-15T01:00:00Z')), '2026-11-14');
  } finally { global.fetch = oldFetch; }
});

test('IP and geographic headers are validated and details remain behind login', async () => {
  const saved = process.env.VERCEL;
  const now = new Date();
  const headers = { 'x-forwarded-for': '203.0.113.15, 10.0.0.1', 'x-vercel-ip-country': 'BR', 'x-vercel-ip-country-region': 'SP' };
  try {
    delete process.env.VERCEL;
    assert.equal((await accessRecord({ headers }, now)).ip, null);
    process.env.VERCEL = '1';
    const row = await accessRecord({ headers }, now);
    assert.equal(row.ip, '203.0.113.15');
    assert.equal(row.region, 'SP');
    assert.equal((await accessRecord({ headers: { 'x-forwarded-for': '<script>', 'x-vercel-ip-country': 'invalid' } }, now)).ip, null);
    const locations = summarizeLocations([['BR:SP', '2', 'BR:RJ', '1'], { 'BR:SP': '3', ':': '1' }]);
    assert.deepEqual(locations[0], { country: 'BR', region: 'SP', name: 'São Paulo (SP)', visits: 5 });
    const rows = recentAccess([[JSON.stringify(row), '{invalid', JSON.stringify({ ...row, at: '2020-01-01T00:00:00Z' })]]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].location, 'São Paulo (SP)');
  } finally { if (saved === undefined) delete process.env.VERCEL; else process.env.VERCEL = saved; }
});

test('visitor script deduplicates a tab and retries failed requests', async () => {
  const source = readFileSync(require.resolve('../visits.js'), 'utf8');
  const store = new Map();
  let calls = 0;
  let ok = false;
  const context = { Date, JSON, Number, sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) }, fetch: async () => { calls++; return { ok }; } };
  const run = async () => { vm.runInNewContext(source, context); await new Promise(resolve => setImmediate(resolve)); };
  await run();
  assert.equal(store.size, 0);
  ok = true;
  await run();
  assert.equal(calls, 2);
  await run();
  assert.equal(calls, 2);
});

test('database configuration errors explain the fix without exposing secrets', async () => {
  const keys = ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'];
  const saved = keys.map(key => process.env[key]);
  const oldFetch = global.fetch;
  try {
    keys.forEach(key => delete process.env[key]);
    await assert.rejects(redis([['PING']]), /Falta UPSTASH_REDIS_REST_URL/);
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
    await assert.rejects(redis([['PING']]), /Falta UPSTASH_REDIS_REST_TOKEN/);
    process.env.UPSTASH_REDIS_REST_TOKEN = 'private-test-token';
    process.env.UPSTASH_REDIS_REST_URL = 'UPSTASH_REDIS_REST_TOKEN';
    await assert.rejects(redis([['PING']]), /URL inválida/);
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'WRONGPASS' }) });
    await assert.rejects(redis([['PING']]), error => error instanceof VisitStoreError && /recusou o token/.test(error.message) && !error.message.includes('private-test-token'));
    global.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: 'private-test-token' }) });
    await assert.rejects(redis([['PING']]), error => /HTTP 404 em redis.example/.test(error.message) && !error.message.includes('private-test-token'));
    global.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'WRONGPASS invalid auth token' }) });
    await assert.rejects(redis([['PING']]), /recusou o token/);
    global.fetch = async () => ({ ok: true, json: async () => [{ error: 'READONLY private-test-token' }] });
    await assert.rejects(redis([['PING']]), error => /Read-Only/.test(error.message) && !error.message.includes('private-test-token'));
    global.fetch = async () => ({ ok: true, json: async () => [{ result: 1 }, { error: 'ERR wrong number of arguments' }] });
    await assert.rejects(redis([['INCR', 'counter'], ['EXPIRE', 'counter', 120]]), /recusou EXPIRE: ERR wrong number of arguments/);
    global.fetch = async () => ({ ok: true, json: async () => [{ error: `ERR ${process.env.PANEL_PASSWORD} private-test-token Bearer another-private-value` }] });
    await assert.rejects(redis([['INCR', 'counter']]), error => !error.message.includes('private-test-token') && !error.message.includes(process.env.PANEL_PASSWORD) && !error.message.includes('another-private-value'));
    keys.forEach(key => delete process.env[key]);
    process.env.KV_REST_API_URL = ' "https://redis.example" ';
    process.env.KV_REST_API_TOKEN = ' "private-test-token=" ';
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://redis.example/pipeline');
      assert.equal(options.headers.Authorization, 'Bearer private-test-token=');
      return { ok: true, json: async () => [{ result: 'PONG' }] };
    };
    assert.deepEqual(await redis([['PING']]), ['PONG']);
  } finally {
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
    global.fetch = oldFetch;
  }
});
