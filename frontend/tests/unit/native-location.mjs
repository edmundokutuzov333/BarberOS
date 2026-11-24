import assert from 'node:assert/strict';
import { parseSystemPosition, getCurrentPosition } from '../../src/lib/native-location.ts';
const point = { ok: true, latitude: -25.96, longitude: 32.58, accuracy: 120, timestamp: Date.now() };
assert.equal(parseSystemPosition(point).latitude, point.latitude);
for (const value of [{ ...point, longitude: 181 }, { ...point, accuracy: -1 }, { ...point, timestamp: Date.now() - 400000 }, { ...point, latitude: NaN }, { ok: false, code: 1 }, { ...point, secret: 'unexpected-field' }]) assert.throws(() => parseSystemPosition(value));
const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
try {
  let browserCalls = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { geolocation: { getCurrentPosition(success) { browserCalls++; success({ coords: point, timestamp: point.timestamp }); } } } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { barberosNative: { apiVersion: 1, getCurrentPosition: async () => point } } });
  assert.equal((await getCurrentPosition()).longitude, point.longitude);
  assert.equal(browserCalls, 0);
  globalThis.window.barberosNative.getCurrentPosition = async () => ({ ok: false, code: 1 });
  await assert.rejects(getCurrentPosition());
  assert.equal(browserCalls, 0, 'A denied native permission must not be bypassed through another provider');
  globalThis.window.barberosNative.apiVersion = 2;
  assert.equal((await getCurrentPosition()).latitude, point.latitude);
  assert.equal(browserCalls, 1);
  delete globalThis.window.barberosNative;
  assert.equal((await getCurrentPosition()).accuracy, point.accuracy);
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else delete globalThis.window;
  if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator); else delete globalThis.navigator;
}
console.log('PASS | native/browser location selection, denial, bounds, freshness and version contracts');
