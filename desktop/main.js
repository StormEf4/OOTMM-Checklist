const { app, BrowserWindow, Menu, shell, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.setAppUserModelId('com.ootmmchecklist.app');
if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 380, minHeight: 500,
    title: 'OoTMM Checklist',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0d211a',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.on('second-instance', () => {
  const [w] = BrowserWindow.getAllWindows();
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

/* The player's own item menu icons, one picture per item, in an "icons" folder beside the saved data. The folder
   isn't part of the app's files, so installing a newer version keeps it. Pictures dropped into it by hand work too. */
const iconDir = () => path.join(app.getPath('userData'), 'icons');
const IMG = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif' };
const okId = id => typeof id === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(id);
ipcMain.handle('icons:list', () => {
  const out = {};
  if (!fs.existsSync(iconDir())) return out;
  for (const f of fs.readdirSync(iconDir())) {
    const ext = path.extname(f).toLowerCase(), id = path.basename(f, path.extname(f));
    if (!IMG[ext] || !okId(id)) continue;
    out[id.toUpperCase()] = `data:${IMG[ext]};base64,${fs.readFileSync(path.join(iconDir(), f)).toString('base64')}`;
  }
  return out;
});
ipcMain.handle('icons:put', (_e, id, dataUrl) => {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!okId(id) || !m) throw new Error('bad icon');
  fs.mkdirSync(iconDir(), { recursive: true });
  for (const ext of Object.keys(IMG)) fs.rmSync(path.join(iconDir(), id + ext), { force: true });
  fs.writeFileSync(path.join(iconDir(), id + '.png'), Buffer.from(m[1], 'base64'));
});
ipcMain.handle('icons:remove', (_e, id) => {
  if (!okId(id) || !fs.existsSync(iconDir())) return;
  for (const f of fs.readdirSync(iconDir())) if (path.basename(f, path.extname(f)).toUpperCase() === id.toUpperCase()) fs.rmSync(path.join(iconDir(), f), { force: true });
});
ipcMain.handle('icons:open', () => { fs.mkdirSync(iconDir(), { recursive: true }); return shell.openPath(iconDir()); });

app.whenReady().then(createWindow);
/* Write saved progress and renames to disk before the app closes, so nothing waits in memory. */
app.on('before-quit', () => session.defaultSession.flushStorageData());
app.on('window-all-closed', () => { session.defaultSession.flushStorageData(); app.quit(); });
