const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const html = readFileSync(join(__dirname, '../debitos.html'), 'utf8');
const script = readFileSync(join(__dirname, '../debitos.js'), 'utf8');

function page(available = true) {
  const elements = new Map([...html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => [id, {
    disabled: /\sdisabled(?:\s|>)/.test(tag), hidden: /\shidden(?:\s|>)/.test(tag),
    checked: /\schecked(?:\s|>)/.test(tag),
    textContent: '', listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    showModal() { this.open = true; },
    close() { this.open = false; }
  }]));
  const storage = new Map();
  const posts = [];
  let cleared = false;
  const seller = { name: 'Prestador Exemplo' };
  runInNewContext(script, {
    document: { getElementById: id => elements.get(id) || null, querySelectorAll: () => [] },
    window: { CadastroSession: { read: () => ({ name: 'Cliente Exemplo' }), clear: () => { cleared = true; } } },
    sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => '0dbb3d92-e919-4eb7-8a0e-d66e59e864fe' },
    Intl, Date, setInterval() {},
    fetch: async (url, options) => {
      if (options?.method === 'POST') {
        posts.push(JSON.parse(options.body));
        return { ok: true, json: async () => ({ reference: 'CAD_test', token: 'test', qrCode: '000201test', status: 'pending', seller }) };
      }
      return { ok: available, json: async () => available ? { seller } : { error: 'Serviço indisponível.' } };
    }
  });
  return { elements, posts, cleared: () => cleared };
}

test('entry notice opens on arrival and acknowledgement closes it without creating a payment', () => {
  const { elements, posts } = page();
  assert.equal(elements.get('entry-notice').open, true);
  elements.get('entry-notice-confirm').listeners.click();
  assert.equal(elements.get('entry-notice').open, false);
  assert.equal(posts.length, 0);
});

test('payment page without removed fields enables Pix and submits explicit button acceptance', async () => {
  const pageState = page();
  await new Promise(setImmediate);
  const { elements, posts } = pageState;
  assert.equal(elements.get('generate-pix').disabled, false);
  await elements.get('checkout-form').listeners.submit({ preventDefault() {} });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].accepted, true);
  assert.equal(posts[0].sellerName, 'Prestador Exemplo');
  assert.equal(elements.get('payment-preview').open, true);
  assert.equal(elements.get('pix-code').value, '000201test');
  assert.equal(elements.get('generate-pix').disabled, true);
  assert.equal(pageState.cleared(), true);
  await elements.get('checkout-form').listeners.submit({ preventDefault() {} });
  assert.equal(posts.length, 1);
});

test('unavailable checkout displays the error and keeps Pix disabled', async () => {
  const { elements, posts } = page(false);
  await new Promise(setImmediate);
  assert.equal(elements.get('generate-pix').disabled, true);
  assert.equal(elements.get('offer-status').textContent, 'Serviço indisponível.');
  assert.equal(posts.length, 0);
});

test('service selection updates the total and prevents payment when deselected', async () => {
  const { elements, posts } = page();
  await new Promise(setImmediate);
  const all = elements.get('select-all-services');
  const service = elements.get('select-service');
  service.checked = false;
  service.listeners.change();
  assert.equal(all.checked, false);
  assert.equal(elements.get('selected-service-total').textContent, 'R$ 0,00');
  assert.equal(elements.get('generate-pix').disabled, true);
  await elements.get('checkout-form').listeners.submit({ preventDefault() {} });
  assert.equal(posts.length, 0);
  all.checked = true;
  all.listeners.change();
  assert.equal(service.checked, true);
  assert.equal(elements.get('selected-service-total').textContent, 'R$ 56,98');
  assert.equal(elements.get('generate-pix').disabled, false);
  await elements.get('checkout-form').listeners.submit({ preventDefault() {} });
  assert.equal(posts.length, 1);
  assert.equal(service.disabled, true);
  assert.equal(all.disabled, true);
});
