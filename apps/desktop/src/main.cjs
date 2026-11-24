'use strict';
const { app, BrowserWindow, Menu, dialog, shell, session, systemPreferences } = require('electron');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');
const { registerLocation } = require('./location.cjs');
const { ORIGIN, isAppUrl, isExternalUrl, isDownloadUrl, allowPermission } = require('./policy.cjs');
let mainWindow;
let quitting = false;
let updateCheck;
const offlinePage = path.join(__dirname, 'offline.html');
app.enableSandbox();
app.setAppUserModelId('app.barberos.desktop');
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (!app.isReady()) return; if (!mainWindow) createWindow(); else mainWindow.show(); });
  app.whenReady().then(() => { registerLocation(() => mainWindow); configureSession(); createWindow(); configureMenu(); });
}
function openExternal(url) {
  if (isExternalUrl(url)) shell.openExternal(url).catch(() => dialog.showErrorBox('Não foi possível abrir a ligação', 'Verifique se existe uma aplicação compatível instalada.'));
}
function configureSession() {
  const ses = session.fromPartition('persist:barberos-production');
  // Never persist third-party cookies; authentication belongs to the hosted first-party app.
  ses.setPermissionCheckHandler((_contents, permission, origin, details) => allowPermission(origin, permission, details));
  ses.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    if (!allowPermission(contents.getURL(), permission, details)) return callback(false);
    if (permission === 'clipboard-sanitized-write') return callback(true);
    if (process.platform === 'darwin' && !await systemPreferences.askForMediaAccess('camera')) return callback(false);
    const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', buttons: ['Permitir', 'Cancelar'], defaultId: 1, cancelId: 1, message: 'Permitir a câmara para ler códigos QR?', detail: 'Apenas a BarberOS terá acesso enquanto esta funcionalidade estiver aberta.' });
    callback(response === 0);
  });
  ses.on('will-download', (event, item, contents) => {
    if (!contents || !isAppUrl(contents.getURL()) || !isDownloadUrl(item.getURL())) return event.preventDefault();
    item.setSaveDialogOptions({ title: 'Guardar ficheiro BarberOS', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')) });
    item.once('done', (_event, state) => { if (state !== 'completed' && state !== 'cancelled') dialog.showErrorBox('Download interrompido', 'O ficheiro não foi guardado. Tente novamente.'); });
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1280, height: 860, minWidth: 390, minHeight: 600, show: false, backgroundColor: '#090909', title: 'BarberOS', autoHideMenuBar: process.platform === 'win32', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), partition: 'persist:barberos-production', nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false, spellcheck: true, devTools: !app.isPackaged } });
  const contents = mainWindow.webContents;
  contents.setWindowOpenHandler(({ url }) => { if (isAppUrl(url)) mainWindow.loadURL(url).catch(showOffline); else openExternal(url); return { action: 'deny' }; });
  const protectNavigation = (event, url) => {
    if (url === 'https://barberos-native.invalid/retry' && contents.getURL().startsWith('file:')) { event.preventDefault(); loadApp(); return; }
    if (!isAppUrl(url)) { event.preventDefault(); openExternal(url); }
  };
  contents.on('will-navigate', protectNavigation);
  contents.on('will-redirect', protectNavigation);
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('did-fail-load', (_event, code, _description, url, isMainFrame) => { if (isMainFrame && code !== -3 && isAppUrl(url)) showOffline(); });
  contents.on('render-process-gone', showOffline);
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  loadApp();
}
function showOffline() { if (!quitting && mainWindow && !mainWindow.isDestroyed()) mainWindow.loadFile(offlinePage).catch(() => {}); }
function loadApp() { if (mainWindow) mainWindow.loadURL(ORIGIN, { extraHeaders: 'Cache-Control: no-cache\n' }).catch(showOffline); }
async function checkUpdates() {
  if (updateCheck) return;
  // macOS Squirrel requires a distribution-signed application. Do not pretend ad-hoc builds can self-update.
  if (process.platform === 'darwin') { openExternal('https://github.com/edmundokutuzov333/BarberOS/releases/latest'); return; }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  try {
    updateCheck = autoUpdater.checkForUpdates();
    const result = await updateCheck;
    if (!result || result.updateInfo.version === app.getVersion()) { await dialog.showMessageBox(mainWindow, { message: 'A aplicação está actualizada.', detail: 'A interface e as funcionalidades online acompanham automaticamente a versão publicada da main.' }); return; }
    const { response } = await dialog.showMessageBox(mainWindow, { buttons: ['Transferir', 'Mais tarde'], defaultId: 1, cancelId: 1, message: `BarberOS ${result.updateInfo.version} disponível` });
    if (response !== 0) return;
    await autoUpdater.downloadUpdate();
    const install = await dialog.showMessageBox(mainWindow, { buttons: ['Reiniciar e instalar', 'Mais tarde'], defaultId: 1, cancelId: 1, message: 'Actualização transferida e verificada. Reiniciar?' });
    if (install.response === 0) autoUpdater.quitAndInstall();
  } catch { await dialog.showMessageBox(mainWindow, { type: 'warning', message: 'Não foi possível verificar a actualização.', detail: 'As funções online continuam disponíveis. Pode consultar os instaladores no menu Ajuda.' }); }
  finally { updateCheck = undefined; }
}
function configureMenu() {
  const native = process.platform === 'darwin' ? [{ label: 'BarberOS', submenu: [{ role: 'about' }, { label: 'Procurar actualizações…', click: checkUpdates }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : [];
  Menu.setApplicationMenu(Menu.buildFromTemplate([...native, { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] }, { label: 'Navegar', submenu: [{ label: 'Início', accelerator: 'CmdOrCtrl+Home', click: loadApp }, { label: 'Voltar', accelerator: 'Alt+Left', click: () => { if (mainWindow?.webContents.navigationHistory.canGoBack()) mainWindow.webContents.navigationHistory.goBack(); } }, { label: 'Actualizar página', accelerator: 'CmdOrCtrl+R', click: () => isAppUrl(mainWindow?.webContents.getURL()) ? mainWindow.webContents.reloadIgnoringCache() : loadApp() }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }, { role: 'windowMenu' }, { label: 'Ajuda', submenu: [{ label: 'Procurar actualizações…', click: checkUpdates }, { label: 'Instaladores oficiais', click: () => openExternal('https://github.com/edmundokutuzov333/BarberOS/releases/latest') }, { label: 'Abrir no navegador', click: () => openExternal(isAppUrl(mainWindow?.webContents.getURL()) ? mainWindow.webContents.getURL() : ORIGIN) }] }]));
}
