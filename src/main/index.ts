// Original candidate app shell, written for this standalone export on 2026-10-06.
// Owns only the candidate lifecycle and its settings window.
import { app, BrowserWindow, Menu } from 'electron';
import { join, resolve } from 'node:path';
import { handleAppProtocol, registerAppScheme } from './focus/app-protocol';
import { registerFocusMain, type FocusMain } from './focus';

app.setName('Focus Buddy Candidate');
const candidateData = process.env.FOCUS_BUDDY_USER_DATA_DIR;
app.setPath(
  'userData',
  candidateData
    ? resolve(candidateData)
    : join(app.getPath('appData'), 'Focus Buddy Candidate'),
);

const ownsInstance = app.requestSingleInstanceLock();
let focus: FocusMain | undefined;
let mainWindow: BrowserWindow | undefined;
let openRequested = false;
let quitting = false;
let quitFlushed = false;
let flushPending = false;

function showSettings(): void {
  if (focus && mainWindow && !mainWindow.isDestroyed()) {
    focus.showMain();
  } else {
    openRequested = true;
  }
}

if (!ownsInstance) {
  app.quit();
} else {
  registerAppScheme();
  app.on('second-instance', showSettings);

  app.whenReady().then(() => {
    handleAppProtocol();
    Menu.setApplicationMenu(null);
    if (process.platform === 'darwin') app.dock?.hide();

    app.on('web-contents-created', (_event, contents) => {
      contents.session.setPermissionRequestHandler((_wc, _permission, reply) => reply(false));
      contents.session.setPermissionCheckHandler(() => false);
    });

    focus = registerFocusMain();
    const window = new BrowserWindow({
      title: 'Focus Buddy Candidate',
      width: 520,
      height: 740,
      minWidth: 420,
      minHeight: 560,
      show: false,
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      icon: join(__dirname, '../renderer/cat/app-icon.png'),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    mainWindow = window;
    focus.attachMainWindow(window);
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on('closed', () => {
      if (mainWindow === window) mainWindow = undefined;
    });

    // The status item is the initial UI. The optional widget restores its own preference.
    const rendererUrl = !app.isPackaged && process.env.ELECTRON_RENDERER_URL
      ? process.env.ELECTRON_RENDERER_URL
      : 'app://renderer/index.html';
    void window.loadURL(rendererUrl).catch((error: unknown) => {
      console.error('Candidate settings failed to load', error);
    });
    if (openRequested) {
      openRequested = false;
      showSettings();
    }
    app.on('activate', showSettings);
  }).catch((error: unknown) => {
    console.error('Candidate startup failed', error);
    app.quit();
  });

  app.on('before-quit', (event) => {
    if (!focus || quitFlushed) {
      quitting = true;
      return;
    }
    event.preventDefault();
    if (flushPending) return;
    flushPending = true;
    void focus.flushOnQuit().catch((error: unknown) => {
      console.error('Candidate timer shutdown save failed', error);
    }).finally(() => {
      quitFlushed = true;
      quitting = true;
      app.quit();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
