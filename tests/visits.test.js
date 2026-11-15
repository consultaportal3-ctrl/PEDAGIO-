const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const handler = require('../api/visits');
const { day } = require('../lib/visits');

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
    assert.equal((await request('GET', null, cookie, { days: 30 })).body.total, 60);
    assert.equal((await request('GET', null, cookie, { days: 9999 })).code, 400);
    assert.equal((await request('GET', null, cookie + 'tampered')).code, 401);
    assert.equal((await request('POST', { action: 'visit', plate: 'ignored' })).code, 204);
    assert.equal(JSON.stringify(calls.at(-1)).includes('ignored'), false);
    assert.equal((await request('DELETE')).code, 204);
    global.fetch = async () => { throw new Error('offline'); };
    assert.equal((await request('GET', null, cookie)).code, 503);
    assert.equal(day(new Date('2026-11-15T01:00:00Z')), '2026-11-14');
  } finally { global.fetch = oldFetch; }
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
