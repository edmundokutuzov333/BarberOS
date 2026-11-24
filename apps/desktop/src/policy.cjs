'use strict';
const ORIGIN = 'https://barber-os-orpin.vercel.app';
function isAppUrl(value) {
  try { const url = new URL(value); return url.origin === ORIGIN && !url.username && !url.password; } catch { return false; }
}
function isExternalUrl(value) {
  try { const url = new URL(value); return ['https:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function isDownloadUrl(value) {
  return isAppUrl(value) || (value.startsWith('blob:') && isAppUrl(value.slice(5)));
}
function allowPermission(origin, permission, details = {}) {
  if (!isAppUrl(origin)) return false;
  if (permission === 'clipboard-sanitized-write') return true;
  return permission === 'media' && (details.mediaType === 'video' || (details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'video'));
}
module.exports = { ORIGIN, isAppUrl, isExternalUrl, isDownloadUrl, allowPermission };
