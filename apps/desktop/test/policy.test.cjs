const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ORIGIN, isAppUrl, isExternalUrl, isDownloadUrl, allowPermission } = require('../src/policy.cjs');
test('navigation confines app content to the exact HTTPS production origin', () => {
  for (const value of [ORIGIN, `${ORIGIN}/entrar`, `${ORIGIN}/b/fomentosial/loja?x=1`]) assert.equal(isAppUrl(value), true);
  for (const value of ['http://barber-os-orpin.vercel.app', `${ORIGIN}.evil.test`, 'https://evil.test', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,evil', 'https://user@barber-os-orpin.vercel.app', 'barberos://login', '']) assert.equal(isAppUrl(value), false, value);
});
test('external navigation rejects code execution and embedded credentials', () => {
  for (const value of ['https://example.com', 'mailto:help@example.com', 'tel:+258840000000']) assert.equal(isExternalUrl(value), true);
  for (const value of ['javascript:alert(1)', 'file:///tmp/x', 'data:text/html,x', 'http://example.com', 'https://user:pass@example.com']) assert.equal(isExternalUrl(value), false);
});
test('downloads are first-party and permissions exclude microphone/geolocation', () => {
  assert.equal(isDownloadUrl(`blob:${ORIGIN}/123`), true);
  assert.equal(isDownloadUrl('blob:https://evil.test/123'), false);
  assert.equal(allowPermission(ORIGIN, 'media', { mediaTypes: ['video'] }), true);
  assert.equal(allowPermission(ORIGIN, 'media', { mediaType: 'video' }), true);
  for (const permission of ['geolocation', 'notifications', 'clipboard-read', 'display-capture', 'midiSysex']) assert.equal(allowPermission(ORIGIN, permission), false);
  assert.equal(allowPermission(ORIGIN, 'media', { mediaTypes: ['audio', 'video'] }), false);
  assert.equal(allowPermission('https://evil.test', 'media', { mediaTypes: ['video'] }), false);
});
