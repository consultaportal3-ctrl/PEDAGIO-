const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../server');
const { day } = require('../lib/visits');

function request(server, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('Railway server serves public assets and blocks internal files and traversal', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    for (const path of ['/', '/painel.html', '/painel.js?v=13', '/painel.css', '/index_files/concessionarias.svg', '/vendor/qrcode.js', '/healthz']) {
      assert.equal((await request(server, path)).status, 200, path);
    }
    const head = await request(server, '/painel.html', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.match(head.headers['content-type'], /text\/html/);
    for (const path of ['/server.js', '/package.json', '/lib/visits.js', '/api/visits.js', '/.git/config', '/.env', '/tests/server.test.js', '/.pingupag-docs.tmp.html', '/vendor/%2e%2e/lib/visits.js', '/missing']) {
      assert.equal((await request(server, path)).status, 404, path);
    }
    assert.equal((await request(server, '/%ZZ')).status, 400);
    assert.equal((await request(server, '/', { method: 'POST' })).status, 405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('Railway HTTP adapter supports panel login, cookies, query filters and cleanup', async () => {
  const names = ['PANEL_PASSWORD', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RAILWAY_PROJECT_ID'];
  const saved = names.map(name => process.env[name]);
  const oldFetch = global.fetch;
  const batches = [];
  Object.assign(process.env, { PANEL_PASSWORD: 'test-panel-password', UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' });
  global.fetch = async (_url, options) => {
    const batch = JSON.parse(options.body);
    batches.push(batch);
    return { ok: true, json: async () => batch.map(([command, ...args]) => ({ result: command === 'MGET' ? args.map(() => 0) : command === 'HGETALL' || command === 'LRANGE' ? [] : command === 'GET' ? null : 1 })) };
  };
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await request(server, '/api/visits')).status, 401);
    assert.equal((await request(server, '/api/payments')).status, 401);
    assert.equal((await request(server, '/api/panel-reset', { method: 'POST' })).status, 401);
    assert.equal((await request(server, '/api/pingupag-webhook')).status, 405);
    assert.notEqual((await request(server, '/api/checkout')).status, 404);
    const login = await request(server, '/api/visits', { method: 'POST', headers: { origin }, body: JSON.stringify({ action: 'login', password: 'test-panel-password' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const stats = await request(server, '/api/visits?days=1', { headers: { cookie } });
    assert.equal(stats.status, 200);
    assert.equal(JSON.parse(stats.body).daily.length, 1);
    assert.equal(JSON.parse(stats.body).today, 0);
    const resetBody = JSON.stringify({ confirm: 'clear-today', date: day(new Date()) });
    assert.equal((await request(server, '/api/panel-reset', { method: 'POST', headers: { origin: 'https://other.example', cookie }, body: resetBody })).status, 403);
    const reset = await request(server, '/api/panel-reset', { method: 'POST', headers: { origin, cookie }, body: resetBody });
    assert.equal(reset.status, 200);
    assert.equal(JSON.parse(reset.body).ok, true);
    assert.equal(batches.at(-1)[0][0], 'EVAL');
    assert.equal((await request(server, '/api/visits', { method: 'POST', headers: { origin }, body: '{invalid' })).status, 400);
    assert.equal((await request(server, '/api/visits', { method: 'POST', headers: { origin }, body: 'x'.repeat(65537) })).status, 413);
    process.env.RAILWAY_PROJECT_ID = 'test-railway-project';
    const proxyLogin = await request(server, '/api/visits', { method: 'POST', headers: { origin: 'https://site.up.railway.app', 'x-forwarded-host': 'site.up.railway.app' }, body: JSON.stringify({ action: 'login', password: 'test-panel-password' }) });
    assert.equal(proxyLogin.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    global.fetch = oldFetch;
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});
