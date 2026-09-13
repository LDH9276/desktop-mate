const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, dialog, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { ChatSession } = require('./bridge.cjs');
const { ModelLibrary } = require('./model-library.cjs');
protocol.registerSchemesAsPrivileged([{ scheme: 'mate-model', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let modelLibrary, startupModels = Promise.resolve(), importingModel = false;

const { DEFAULT_SCALE, edges, validBounds, fitBounds, scaledBounds, reachableBounds, resizeBounds, contentScale } = require('./window-geometry.cjs');
let companion, settingsWindow, tray, drag, pointerTimer, statusTimer, saveTimer, quitting = false, uiScale = 1, contentZoom = 1;
let hitRegions = [], ignoresMouse = false;
const session = new ChatSession();
const productionURL = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
const appIcon = path.join(__dirname, '../dist/app-icon.png');
const devURL = process.env.MATE_DEV_URL === 'http://127.0.0.1:5173' ? 'http://127.0.0.1:5173/' : null;
if (process.env.MATE_TEST_USER_DATA) app.setPath('userData', path.resolve(process.env.MATE_TEST_USER_DATA));
function trusted(event) {
  if (![companion, settingsWindow].some(window => window && !window.isDestroyed() && event.sender === window.webContents) || event.senderFrame !== event.sender.mainFrame || ![productionURL, devURL].includes(event.senderFrame?.url?.split('#')[0])) throw new Error('Untrusted IPC sender');
}
function broadcast(channel, value) {
  for (const window of [companion, settingsWindow]) if (window && !window.isDestroyed()) window.webContents.send(channel, value);
}
function openSettings() {
  show();
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  const model = companion.getBounds(), area = screen.getDisplayMatching(model).workArea;
  const width = Math.min(440, area.width), height = Math.min(820, area.height);
  const right = model.x + model.width + 12;
  const x = right + width <= area.x + area.width ? right : Math.max(area.x, model.x - width - 12);
  settingsWindow = new BrowserWindow({ x, y: Math.max(area.y, Math.min(model.y, area.y + area.height - height)), width, height,
    minWidth: Math.min(360, width), minHeight: Math.min(480, height), title: 'Mate · 설정', backgroundColor: '#fcfdf8',
    autoHideMenuBar: true, alwaysOnTop: true, icon: appIcon,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWindow.setAlwaysOnTop(true, 'screen-saver');
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', (event, url) => { if (![productionURL, devURL].includes(url.split('#')[0])) event.preventDefault(); });
  settingsWindow.on('closed', () => { settingsWindow = null; });
  if (devURL) settingsWindow.loadURL(`${devURL}#settings`);
  else settingsWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'settings' });
}
function keepOnTop() {
  if (companion && !companion.isDestroyed()) companion.setAlwaysOnTop(true, 'screen-saver');
}
function windowState() { return { ...companion.getContentBounds(), scale: uiScale, alwaysOnTop: companion.isAlwaysOnTop() }; }
function applyBounds(bounds) {
  const current = companion.getContentBounds();
  if (current.width !== bounds.width || current.height !== bounds.height) companion.setContentBounds(bounds);
  else if (current.x !== bounds.x || current.y !== bounds.y) companion.setPosition(bounds.x, bounds.y);
}
function saveWindow() {
  clearTimeout(saveTimer);
  if (!companion || companion.isDestroyed()) return;
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'window-state.json'), JSON.stringify(companion.getContentBounds())); }
  catch (error) { console.warn('Could not save window position:', error.message); }
}
function updateWindow() {
  uiScale = contentScale(companion.getContentBounds());
  // 창의 외형은 화면에 맞춰 커지되, 내용은 100%보다 크게 확대하지 않는다.
  // 세로 모니터에서 300% 창 배율이 글자·아이콘까지 3배로 키우는 것을 막는다.
  contentZoom = Math.min(1, uiScale);
  companion.webContents.setZoomFactor(contentZoom);
  broadcast('mate:window-state', windowState());
  clearTimeout(saveTimer); saveTimer = setTimeout(saveWindow, 300);
}
function restoreWindow() {
  if (!companion || companion.isDestroyed()) return;
  stopDrag();
  const bounds = companion.getContentBounds(), area = screen.getDisplayMatching(bounds).workArea;
  applyBounds(fitBounds(bounds, area)); updateWindow(); keepOnTop();
  return windowState();
}
function show() {
  if (companion && !companion.isDestroyed()) { companion.show(); keepOnTop(); return; }
  let bounds = scaledBounds(DEFAULT_SCALE, screen.getPrimaryDisplay().workArea);
  try {
    const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'window-state.json'), 'utf8'));
    if (validBounds(saved)) bounds = fitBounds(saved, screen.getDisplayMatching(saved).workArea);
  } catch { /* First launch or an invalid preference file uses the screen-fit default. */ }
  uiScale = contentScale(bounds);
  contentZoom = Math.min(1, uiScale);
  companion = new BrowserWindow({ ...bounds, useContentSize: true,
    frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, icon: appIcon, title: 'Mate · ChatGPT 데스크톱 채팅',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), zoomFactor: contentZoom, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  companion.setContentBounds(bounds);
  uiScale = contentScale(companion.getContentBounds());
  contentZoom = Math.min(1, uiScale);
  companion.webContents.setZoomFactor(contentZoom);
  companion.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  companion.webContents.on('will-navigate', (event, url) => { if (![productionURL, devURL].includes(url.split('#')[0])) event.preventDefault(); });
  companion.webContents.session.setPermissionRequestHandler((_, __, callback) => callback(false));
  keepOnTop();
  companion.webContents.on('did-finish-load', updateWindow);
  if (devURL) companion.loadURL(`${devURL}#companion`);
  else companion.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'companion' });
  companion.on('blur', () => { stopDrag(); keepOnTop(); });
  companion.on('show', keepOnTop);
  companion.on('restore', keepOnTop);
  companion.on('resize', updateWindow);
  companion.on('move', () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveWindow, 300); });
  companion.on('close', event => { if (!quitting) { event.preventDefault(); stopDrag(); companion.hide(); } });
  companion.on('closed', () => { companion = null; clearInterval(pointerTimer); });
  pointerTimer = setInterval(() => {
    if (!companion || companion.isDestroyed() || !companion.isVisible()) return;
    const cursor = screen.getCursorScreenPoint();
    if (drag) {
      if (Date.now() - drag.started > 30000) { stopDrag(); return; }
      const area = screen.getDisplayNearestPoint(cursor).workArea;
      const dx = cursor.x - drag.cursor.x, dy = cursor.y - drag.cursor.y;
      if (drag.kind === 'resize') {
        if (drag.lastX === cursor.x && drag.lastY === cursor.y) return;
        drag.lastX = cursor.x; drag.lastY = cursor.y;
        applyBounds(resizeBounds(drag.bounds, dx, dy, drag.edge, area));
      }
      else {
        const next = reachableBounds({ ...drag.bounds, x: drag.bounds.x + dx, y: drag.bounds.y + dy }, area);
        companion.setPosition(next.x, next.y);
        if (drag.kind === 'character') companion.webContents.send('mate:motion', { kind: 'move', ...cursor, now: Date.now() });
      }
    } else {
      const [x, y] = companion.getPosition();
      const hit = hitRegions.some(r => cursor.x - x >= r.x * contentZoom && cursor.x - x <= (r.x + r.width) * contentZoom && cursor.y - y >= r.y * contentZoom && cursor.y - y <= (r.y + r.height) * contentZoom);
      if (ignoresMouse !== !hit) { ignoresMouse = !hit; companion.setIgnoreMouseEvents(ignoresMouse, { forward: true }); }
    }
  }, 25);
}
function stopDrag() {
  if (!drag) return; const kind = drag.kind; drag = null;
  saveWindow();
  if (kind === 'character' && companion && !companion.isDestroyed()) companion.webContents.send('mate:motion', { kind: 'end', ...screen.getCursorScreenPoint(), now: Date.now() });
}
session.on('change', state => broadcast('mate:state', state));
ipcMain.handle('mate:open-settings', event => { trusted(event); openSettings(); });
ipcMain.handle('mate:close-settings', event => { trusted(event); settingsWindow?.close(); });
ipcMain.handle('mate:state', event => { trusted(event); return session.snapshot(); });
ipcMain.handle('mate:models', async event => { trusted(event); await startupModels; return modelLibrary.list(); });
ipcMain.handle('mate:import-model', async event => {
  trusted(event);
  if (importingModel) throw new Error('모델을 불러오는 중입니다. 잠시 기다려 주세요.');
  importingModel = true;
  try {
    const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), { title: '3D 모델 ZIP 불러오기', properties: ['openFile'], filters: [{ name: '모델 ZIP', extensions: ['zip'] }] });
    if (selected.canceled || !selected.filePaths.length) return null;
    await startupModels;
    return await modelLibrary.importZip(selected.filePaths[0]);
  } finally { importingModel = false; }
});
ipcMain.handle('mate:scan', (event, targetUrl) => { trusted(event); return session.scan(targetUrl); });
ipcMain.handle('mate:connect', (event, id, targetUrl) => { trusted(event); return session.connect(id, targetUrl); });
ipcMain.handle('mate:disconnect', event => { trusted(event); return session.disconnect(); });
ipcMain.handle('mate:send', (event, text) => { trusted(event); return session.send(text); });
ipcMain.handle('mate:hide', event => { trusted(event); stopDrag(); companion.hide(); });
ipcMain.handle('mate:quit', event => { trusted(event); app.quit(); });
ipcMain.handle('mate:window-state', event => { trusted(event); return windowState(); });
ipcMain.handle('mate:window-scale', (event, scale) => {
  trusted(event); if (!Number.isFinite(scale) || scale < 0.75 || scale > 3) throw new Error('Invalid window scale');
  stopDrag(); const bounds = companion.getContentBounds(), area = screen.getDisplayMatching(bounds).workArea;
  applyBounds(scaledBounds(scale, area, bounds)); updateWindow(); return windowState();
});
ipcMain.handle('mate:window-restore', event => { trusted(event); return restoreWindow(); });
ipcMain.handle('mate:window-nudge', (event, dx, dy) => {
  trusted(event); if (![dx, dy].every(n => Number.isFinite(n) && Math.abs(n) <= 100)) throw new Error('Invalid window movement');
  const bounds = companion.getContentBounds();
  const area = screen.getDisplayNearestPoint({ x: Math.round(bounds.x + bounds.width / 2 + dx), y: Math.round(bounds.y + 30 + dy) }).workArea;
  const next = reachableBounds({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, area);
  companion.setPosition(next.x, next.y); return windowState();
});
ipcMain.on('mate:drag-start', (event, kind) => {
  trusted(event); stopDrag(); const cursor = screen.getCursorScreenPoint();
  drag = { bounds: companion.getContentBounds(), kind: kind === 'window' ? 'window' : 'character', cursor, started: Date.now() };
  ignoresMouse = false; companion.setIgnoreMouseEvents(false);
  if (drag.kind === 'character') companion.webContents.send('mate:motion', { kind: 'start', ...cursor, now: Date.now() });
});
ipcMain.on('mate:resize-start', (event, edge) => {
  trusted(event); if (!edges.includes(edge)) return; stopDrag();
  const cursor = screen.getCursorScreenPoint();
  drag = { kind: 'resize', edge, bounds: companion.getContentBounds(), cursor, lastX: cursor.x, lastY: cursor.y, started: Date.now() };
  ignoresMouse = false; companion.setIgnoreMouseEvents(false);
});
ipcMain.on('mate:drag-end', event => { trusted(event); stopDrag(); });
ipcMain.on('mate:regions', (event, regions) => {
  trusted(event); if (event.sender !== companion.webContents || !Array.isArray(regions)) return;
  hitRegions = regions.slice(0, 64).filter(r => r && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(r[k])) && r.width >= 0 && r.height >= 0);
});
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.whenReady().then(() => {
    modelLibrary = new ModelLibrary(path.join(app.getPath('userData'), 'model-library'));
    protocol.handle('mate-model', async request => {
      try {
        const file = await modelLibrary.resolve(request.url);
        const response = await net.fetch(pathToFileURL(file).href);
        const headers = new Headers(response.headers); headers.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, { status: response.status, headers });
      } catch { return new Response('Model resource not found', { status: 404 }); }
    });
    // A ZIP placed beside Mate is a local model drop-in. Installed models live
    // in userData, so portable application upgrades do not remove them.
    startupModels = (async () => {
      const folders = new Set([app.getAppPath(), path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'))]);
      for (const folder of folders) {
        for (const file of fs.readdirSync(folder, { withFileTypes: true })) {
          if (!file.isFile() || !/\.zip$/i.test(file.name)) continue;
          try { await modelLibrary.importZip(path.join(folder, file.name)); }
          catch (error) { console.warn(`Model ZIP ${file.name}: ${error.message}`); }
        }
      }
    })().catch(error => console.warn('Could not check adjacent model ZIPs:', error.message));
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, '../dist/tray.png')));
    tray.setToolTip('Mate · ChatGPT 데스크톱 채팅');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '캐릭터와 채팅 열기', click: show },
      { label: '창을 화면 안으로 복원', click: () => { show(); restoreWindow(); } },
      { label: '창 크기', submenu: [0.75, 1, 1.5, 2, 3].map(scale => ({ label: `${Math.round(scale * 100)}%`, click: () => {
        show(); stopDrag(); const bounds = companion.getContentBounds(); applyBounds(scaledBounds(scale, screen.getDisplayMatching(bounds).workArea, bounds)); updateWindow();
      } })) },
      { label: '캐릭터 및 ChatGPT 설정', click: openSettings },
      { type: 'separator' }, { label: '종료', click: () => app.quit() },
    ])); tray.on('click', show); tray.on('double-click', show);
    show(); statusTimer = setInterval(() => void session.refresh(), 2500);
    screen.on('display-removed', restoreWindow);
    screen.on('display-metrics-changed', restoreWindow);
  });
  app.on('before-quit', () => { quitting = true; saveWindow(); clearInterval(pointerTimer); clearInterval(statusTimer); session.dispose(); tray?.destroy(); });
}
