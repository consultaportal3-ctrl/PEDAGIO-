const { test } = require('node:test');
const assert = require('node:assert/strict');
const { clientIP, publicOrigin } = require('../lib/hosting');
const { accessRecord } = require('../lib/access');

test('Railway uses its edge IP and public domain without trusting Vercel geography', async () => {
  const names = ['VERCEL', 'RAILWAY_PROJECT_ID', 'RAILWAY_PUBLIC_DOMAIN', 'PUBLIC_SITE_URL'];
  const saved = names.map(name => process.env[name]);
  try {
    names.forEach(name => delete process.env[name]);
    const req = { headers: { 'x-real-ip': '203.0.113.25', 'x-forwarded-for': '203.0.113.26', 'x-vercel-ip-country': 'BR', 'x-vercel-ip-country-region': 'SP' } };
    assert.equal(clientIP(req), null);
    process.env.RAILWAY_PROJECT_ID = 'test-project';
    process.env.RAILWAY_PUBLIC_DOMAIN = 'site.up.railway.app';
    assert.equal(clientIP(req), '203.0.113.25');
    const record = await accessRecord(req, new Date());
    assert.equal(record.ip, '203.0.113.25');
    assert.equal(record.country, '');
    assert.equal(record.region, '');
    assert.equal(publicOrigin(), 'https://site.up.railway.app');
    process.env.PUBLIC_SITE_URL = 'https://pedagio-digital.online';
    assert.equal(publicOrigin(), 'https://pedagio-digital.online');
    for (const invalid of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?key=secret']) {
      process.env.PUBLIC_SITE_URL = invalid;
      assert.throws(publicOrigin);
    }
    delete process.env.RAILWAY_PROJECT_ID;
    process.env.VERCEL = '1';
    assert.equal(clientIP(req), '203.0.113.26');
    req.headers['x-forwarded-for'] = 'invalid';
    assert.equal(clientIP(req), null);
  } finally {
    names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
  }
});
