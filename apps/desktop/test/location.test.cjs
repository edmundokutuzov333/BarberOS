'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validPosition } = require('../src/location.cjs');
test('system location contract rejects malformed, stale or impossible positions', () => {
  const point = { ok: true, latitude: -25.96, longitude: 32.58, accuracy: 100, timestamp: Date.now() };
  assert.equal(validPosition(point), true);
  for (const change of [{ latitude: 91 }, { longitude: -181 }, { latitude: NaN }, { accuracy: -1 }, { accuracy: Infinity }, { timestamp: Date.now() - 400000 }, { timestamp: Date.now() + 400000 }, { ok: false }]) assert.equal(validPosition({ ...point, ...change }), false);
  for (const value of [null, undefined, {}, { ok: false, code: 1 }]) assert.equal(validPosition(value), false);
});
test('compiled operating-system provider exposes only its one-shot location request', () => {
  const provider = require('../native/build/Release/barberos_location.node');
  assert.deepEqual(Object.keys(provider), ['requestLocation']);
  assert.equal(typeof provider.requestLocation, 'function');
});
test('location IPC requires the focused trusted main frame and honours explicit consent', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  let handler, promptCount = 0, providerCalls = 0, response = 1;
  const point = { ok: true, latitude: -25.96, longitude: 32.58, accuracy: 100, timestamp: Date.now() };
  const frame = { url: 'https://barber-os-orpin.vercel.app/' };
  const contents = { mainFrame: frame, getURL: () => frame.url };
  const window = { isDestroyed: () => false, isFocused: () => true, webContents: contents };
  try {
    Module._load = function(name, ...args) {
      if (name === 'electron') return { ipcMain: { handle(channel, value) { assert.equal(channel, 'barberos:current-position'); handler = value; } }, dialog: { async showMessageBox() { promptCount++; return { response }; } } };
      if (name.endsWith('barberos_location.node')) return { async requestLocation() { providerCalls++; return point; } };
      return originalLoad.call(this, name, ...args);
    };
    delete require.cache[require.resolve('../src/location.cjs')];
    require('../src/location.cjs').registerLocation(() => window);
  } finally { Module._load = originalLoad; }
  const event = { sender: contents, senderFrame: frame };
  assert.deepEqual(await handler({ ...event, senderFrame: { url: frame.url } }), { ok: false, code: 1 }, 'Subframes are denied');
  frame.url = 'https://example.com/';
  assert.deepEqual(await handler(event), { ok: false, code: 1 });
  frame.url = 'https://barber-os-orpin.vercel.app/';
  window.isFocused = () => false;
  assert.deepEqual(await handler(event), { ok: false, code: 1 });
  assert.equal(promptCount, 0);
  window.isFocused = () => true;
  assert.deepEqual(await handler(event), { ok: false, code: 1 });
  assert.equal(providerCalls, 0, 'Refusal never reaches operating-system provider');
  response = 0;
  assert.deepEqual(await handler(event), point);
  assert.equal(providerCalls, 1);
  assert.equal(promptCount, 2);
});
