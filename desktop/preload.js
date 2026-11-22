/* Lets the page keep the player's own item menu icons in a folder on disk, so app updates keep them. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ootmmIcons', {
  list: () => ipcRenderer.invoke('icons:list'),
  put: (id, dataUrl) => ipcRenderer.invoke('icons:put', id, dataUrl),
  remove: id => ipcRenderer.invoke('icons:remove', id),
  open: () => ipcRenderer.invoke('icons:open'),
});

/* Game tracking's catch-up reads the game's save file, which the player picks. */
contextBridge.exposeInMainWorld('ootmmSave', {
  pick: () => ipcRenderer.invoke('save:pick'),
  stat: p => ipcRenderer.invoke('save:stat', p),
  read: p => ipcRenderer.invoke('save:read', p),
});

/* Game tracking's memory reader: reads a few bytes of the game's memory in Project64-EM, only while turned on. */
contextBridge.exposeInMainWorld('ootmmMem', {
  start: () => ipcRenderer.invoke('mem:start'),
  stop: () => ipcRenderer.invoke('mem:stop'),
  status: () => ipcRenderer.invoke('mem:status'),
  grottos: g => ipcRenderer.invoke('mem:grottos', g),
  notes: () => ipcRenderer.invoke('mem:notes'),
});
