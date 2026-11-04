const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

app.setAppUserModelId('com.ootmmchecklist.app');
if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1240, height: 820, minWidth: 380, minHeight: 500,
    title: 'OoTMM Checklist',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#0d211a',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.on('second-instance', () => {
  const [w] = BrowserWindow.getAllWindows();
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
