'use strict';
const { contextBridge, ipcRenderer } = require('electron');
if (window.location.origin === 'https://barber-os-orpin.vercel.app') {
  contextBridge.exposeInMainWorld('barberosNative', Object.freeze({
    apiVersion: 1,
    getCurrentPosition: () => ipcRenderer.invoke('barberos:current-position'),
  }));
}
