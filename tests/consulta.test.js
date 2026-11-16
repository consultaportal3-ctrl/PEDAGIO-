const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const script = readFileSync(join(__dirname, '../consulta.js'), 'utf8');

function page() {
  const elements = new Map();
  const storage = new Map();
  const locations = [];
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, style: {}, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute() {}, removeAttribute() {}, focus() { this.focused = true; },
      querySelector() { return element('submit'); }
    });
    return elements.get(id);
  }
  runInNewContext(script, {
    document: { getElementById: element, querySelectorAll: () => [] },
    window: { CadastroSession: { read: () => ({}) }, location: { assign: url => locations.push(url) } },
    sessionStorage: { setItem: (key, value) => storage.set(key, value) }
  });
  return { element, storage, locations, update: () => element('consultation-form').listeners.input(), submit: () => element('consultation-form').listeners.submit({ preventDefault() {} }) };
}

test('checked agreements never allow advancing without a valid plate, including foreign plates', () => {
  const p = page();
  p.element('terms').checked = p.element('privacy').checked = true;
  for (const foreign of [false, true]) {
    p.element('foreign').checked = foreign;
    for (const value of ['', 'AB']) {
      p.element('plate').value = value;
      p.update();
      assert.equal(p.element('submit').disabled, true);
      p.submit();
      assert.equal(p.locations.length, 0);
      assert.equal(p.storage.size, 0);
    }
  }
});

test('valid Brazilian and foreign plates advance only with both agreements and save the normalized plate', () => {
  for (const [plate, foreign] of [['abc1d23', false], ['abc1234', false], ['ab-123', true]]) {
    const p = page();
    p.element('plate').value = plate;
    p.element('foreign').checked = foreign;
    p.element('terms').checked = true;
    p.update();
    assert.equal(p.element('submit').disabled, true);
    p.submit();
    assert.equal(p.locations.length, 0);
    p.element('privacy').checked = true;
    p.update();
    assert.equal(p.element('submit').disabled, false);
    p.submit();
    assert.deepEqual(p.locations, ['./debitos.html']);
    assert.deepEqual(JSON.parse(p.storage.get('consulta-veiculo')), { plate: plate.toUpperCase(), foreign });
  }
});
