const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lookupLocation, createLocationLookup } = require('../lib/geolocation');
const { accessRecord, recentAccess, summarizeLocations } = require('../lib/access');
const visits = require('../api/visits');
const { candidateMonths, sizeLimit } = require('../scripts/update-geolocation');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

test('monthly installer falls back across year boundaries and limits download size', async () => {
  assert.deepEqual(candidateMonths(new Date('2026-01-01T00:00:00Z')), ['2026-01', '2025-12']);
  assert.deepEqual(candidateMonths(new Date('2026-11-17T12:00:00Z')), ['2026-11', '2026-10']);
  const sink = () => new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  await pipeline(Readable.from([Buffer.from('123')]), sizeLimit(3), sink());
  await assert.rejects(pipeline(Readable.from([Buffer.from('1234')]), sizeLimit(3), sink()), /tamanho permitido/);
});

test('bundled database resolves public IPv4 and IPv6 locally and skips unknown addresses', async () => {
  const savedFetch = global.fetch;
  global.fetch = async () => { throw new Error('Geolocation must not make a network request'); };
  try {
    const ipv4 = await lookupLocation('8.8.8.8');
    assert.equal(ipv4.country, 'US');
    assert.equal(typeof ipv4.region, 'string');
    const ipv6 = await lookupLocation('2001:4860:4860::8888');
    assert.match(ipv6.country, /^[A-Z]{2}$/);
    for (const ip of [null, '', 'invalid', '127.0.0.1', '203.0.113.25']) assert.equal(await lookupLocation(ip), null);
    assert.deepEqual(Object.keys(ipv4).sort(), ['country', 'region']);
  } finally { global.fetch = savedFetch; }
});

test('one local database is shared by concurrent lookups and errors return unknown', async () => {
  let loads = 0;
  const lookup = createLocationLookup(async () => {
    loads++;
    return { get: () => ({ country: { iso_code: 'BR' }, subdivisions: [{ names: { en: 'São Paulo' } }] }) };
  });
  assert.equal(await lookup('invalid'), null);
  assert.equal(loads, 0);
  const rows = await Promise.all([lookup('8.8.8.8'), lookup('1.1.1.1')]);
  assert.equal(loads, 1);
  assert.deepEqual(rows[0], { country: 'BR', region: 'São Paulo' });
  const broken = createLocationLookup(async () => { throw new Error('Unavailable database'); });
  assert.equal(await broken('8.8.8.8'), null);
  const malformed = createLocationLookup(async () => ({ get: () => ({ country: { iso_code: '<script>' } }) }));
  assert.equal(await malformed('8.8.8.8'), null);
});

test('Railway records normalize Brazilian states, feed summaries and ignore forged geography', async () => {
  const names = ['RAILWAY_PROJECT_ID', 'VERCEL'];
  const saved = names.map(name => process.env[name]);
  process.env.RAILWAY_PROJECT_ID = 'test-project';
  process.env.VERCEL = '1';
  const now = new Date();
  const req = { headers: { 'x-real-ip': '8.8.8.8', 'x-vercel-ip-country': 'CA', 'x-vercel-ip-country-region': 'ON' } };
  try {
    for (const region of ['São Paulo', 'Sao Paulo', 'SP']) {
      const record = await accessRecord(req, now, async () => ({ country: 'BR', region }));
      assert.equal(record.country, 'BR');
      assert.equal(record.region, 'SP');
      assert.equal(recentAccess([[JSON.stringify(record)]])[0].location, 'São Paulo (SP)');
      assert.equal(summarizeLocations([{ [`${record.country}:${record.region}`]: 1 }])[0].name, 'São Paulo (SP)');
    }
    const unknown = await accessRecord(req, now, async () => { throw new Error('Unavailable'); });
    assert.equal(unknown.ip, '8.8.8.8');
    assert.equal(unknown.country, '');
    assert.equal(unknown.region, '');
    assert.equal(recentAccess([[JSON.stringify(unknown)]])[0].location, 'Não identificado');
    const malformed = await accessRecord(req, now, async () => ({ country: 'US', region: 'bad:key<script>' }));
    assert.equal(malformed.region, '');
  } finally {
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});

test('visit endpoint saves local country and region without coordinates or extra network calls', async () => {
  const names = ['RAILWAY_PROJECT_ID', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
  const saved = names.map(name => process.env[name]);
  const savedFetch = global.fetch;
  Object.assign(process.env, { RAILWAY_PROJECT_ID: 'test-project', UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'test-token' });
  const batches = [];
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://redis.example/pipeline');
    const commands = JSON.parse(options.body);
    batches.push(commands);
    return { ok: true, json: async () => commands.map(() => ({ result: 1 })) };
  };
  try {
    const req = { method: 'POST', headers: { host: 'site.example', origin: 'https://site.example', 'x-real-ip': '8.8.8.8' }, body: { action: 'visit', country: 'BR', region: 'SP' } };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; }, end() {} };
    await visits(req, res);
    assert.equal(res.code, 204);
    assert.equal(batches.length, 1);
    const record = JSON.parse(batches[0].find(row => row[0] === 'LPUSH')[2]);
    assert.equal(record.country, 'US');
    assert.equal(record.region, 'California');
    assert.deepEqual(Object.keys(record).sort(), ['at', 'country', 'id', 'ip', 'region']);
    assert.equal(batches[0].find(row => row[0] === 'HINCRBY')[2], 'US:California');
  } finally {
    global.fetch = savedFetch;
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});
