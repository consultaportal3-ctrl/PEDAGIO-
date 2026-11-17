const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const script = readFileSync(join(__dirname, '../painel.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function page({ confirm = true, status = 200, result = { ok: true } } = {}) {
  const elements = new Map();
  const requests = [];
  let cleared = false;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'period' ? '7' : '', dataset: {}, style: {}, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      replaceChildren() {}, append() {}
    });
    return elements.get(id);
  }
  runInNewContext(script, {
    Intl, Date, setTimeout, setInterval() {},
    document: { getElementById: element, querySelectorAll: () => [], createElement: () => element(Symbol()), addEventListener() {} },
    window: { location: { hash: '' }, addEventListener() {}, confirm: () => confirm },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === '/api/panel-reset') {
        cleared = status === 200 && result?.ok === true;
        return { ok: status === 200, status, json: async () => result };
      }
      const body = url.startsWith('/api/visits')
        ? { daily: [], total: cleared ? 0 : 12, today: cleared ? 0 : 12, updatedAt: new Date().toISOString() }
        : { configured: true, generated: cleared ? 0 : 3, amountGenerated: 300, paid: 0, amountPaid: 0, recent: [] };
      return { ok: true, status: 200, json: async () => body };
    }
  });
  await settle();
  return { element, requests, click: () => element('clear-today').listeners.click() };
}

test('clearing requires confirmation and refreshes visits and payments after success', async () => {
  const cancelled = await page({ confirm: false });
  await cancelled.click();
  assert.equal(cancelled.requests.some(row => row.url === '/api/panel-reset'), false);
  const p = await page();
  const clearing = p.click();
  assert.equal(p.element('clear-today').disabled, true);
  assert.equal(p.element('clear-today').textContent, 'Limpando…');
  await clearing;
  const reset = p.requests.find(row => row.url === '/api/panel-reset');
  assert.equal(reset.options.method, 'POST');
  assert.equal(JSON.parse(reset.options.body).confirm, 'clear-today');
  assert.match(JSON.parse(reset.options.body).date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.element('visits').textContent, '0');
  assert.equal(p.element('pix-generated').textContent, '0');
  assert.equal(p.element('clear-today-status').dataset.state, 'success');
  assert.equal(p.element('clear-today').textContent, 'Limpar');
  assert.equal(p.element('clear-today').disabled, false);
});

test('failed or unconfirmed cleanup shows an error and keeps existing figures', async () => {
  for (const response of [{ status: 503, result: { error: 'Serviço indisponível.' } }, { result: {} }]) {
    const p = await page(response);
    await p.click();
    assert.equal(p.element('clear-today-status').dataset.state, 'error');
    assert.equal(p.element('visits').textContent, '12');
    assert.equal(p.element('clear-today').disabled, false);
  }
});
