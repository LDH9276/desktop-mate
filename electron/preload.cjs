const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const listener = (_, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('mate', {
  openSettings: () => ipcRenderer.invoke('mate:open-settings'),
  closeSettings: () => ipcRenderer.invoke('mate:close-settings'),
  state: () => ipcRenderer.invoke('mate:state'),
  listModels: () => ipcRenderer.invoke('mate:models'),
  importModel: () => ipcRenderer.invoke('mate:import-model'),
  scan: targetUrl => ipcRenderer.invoke('mate:scan', targetUrl),
  connect: (id, targetUrl) => ipcRenderer.invoke('mate:connect', id, targetUrl),
  disconnect: () => ipcRenderer.invoke('mate:disconnect'),
  send: text => ipcRenderer.invoke('mate:send', text),
  preferences: () => ipcRenderer.invoke('mate:preferences'),
  setPreference: (key, value) => ipcRenderer.invoke('mate:preference-set', key, value),
  removePreference: key => ipcRenderer.invoke('mate:preference-remove', key),
  hide: () => ipcRenderer.invoke('mate:hide'),
  quit: () => ipcRenderer.invoke('mate:quit'),
  startDrag: kind => ipcRenderer.send('mate:drag-start', kind),
  startResize: edge => ipcRenderer.send('mate:resize-start', edge),
  windowState: () => ipcRenderer.invoke('mate:window-state'),
  setWindowScale: scale => ipcRenderer.invoke('mate:window-scale', scale),
  restoreWindow: () => ipcRenderer.invoke('mate:window-restore'),
  nudgeWindow: (dx, dy) => ipcRenderer.invoke('mate:window-nudge', dx, dy),
  onWindowState: callback => subscribe('mate:window-state', callback),
  endDrag: () => ipcRenderer.send('mate:drag-end'),
  setRegions: regions => ipcRenderer.send('mate:regions', regions),
  onState: callback => subscribe('mate:state', callback),
  onPreferenceChanged: callback => subscribe('mate:preference-changed', callback),
  onMotion: callback => subscribe('mate:motion', callback),
  onSettings: callback => subscribe('mate:settings', callback),
});
