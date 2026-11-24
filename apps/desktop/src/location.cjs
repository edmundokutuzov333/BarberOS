'use strict';
const { ipcMain, dialog } = require('electron');
const { isAppUrl } = require('./policy.cjs');
const provider = require('../native/build/Release/barberos_location.node');
let inFlight = false;
let consent = false;
function validPosition(value) {
  return value?.ok === true && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 && Number.isFinite(value.accuracy) && value.accuracy >= 0 && Number.isFinite(value.timestamp) && Math.abs(Date.now() - value.timestamp) <= 360000;
}
function registerLocation(getWindow) {
  ipcMain.handle('barberos:current-position', async event => {
    const window = getWindow();
    const frame = event.senderFrame;
    if (!window || window.isDestroyed() || !window.isFocused() || event.sender !== window.webContents || !frame || frame !== window.webContents.mainFrame || !isAppUrl(frame.url)) return { ok: false, code: 1 };
    if (inFlight) return { ok: false, code: 2 };
    inFlight = true;
    try {
      if (!consent) {
        const choice = await dialog.showMessageBox(window, { type: 'question', buttons: ['Permitir localização', 'Cancelar'], defaultId: 1, cancelId: 1, message: 'Procurar barbearias perto de si?', detail: 'A localização é usada neste dispositivo para ordenar as barbearias. Não é guardada na sua conta. O sistema operativo também poderá pedir autorização.' });
        if (choice.response !== 0) return { ok: false, code: 1 };
        consent = true;
      }
      if (window.isDestroyed() || !isAppUrl(window.webContents.getURL())) return { ok: false, code: 1 };
      const result = await provider.requestLocation();
      if (validPosition(result)) return { ok: true, latitude: result.latitude, longitude: result.longitude, accuracy: result.accuracy, timestamp: result.timestamp };
      if (result?.code === 1) consent = false;
      return { ok: false, code: [1, 2, 3].includes(result?.code) ? result.code : 2 };
    } catch { return { ok: false, code: 2 }; }
    finally { inFlight = false; }
  });
}
module.exports = { registerLocation, validPosition };
