// Preload script - Secure bridge between renderer and main process
// This enables contextIsolation while still allowing IPC communication

const { contextBridge, ipcRenderer, shell } = require('electron');

// Expose a controlled API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // ═══════════════════════════════════════════════════════════
  // WINDOW CONTROLS
  // ═══════════════════════════════════════════════════════════
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // ═══════════════════════════════════════════════════════════
  // EXTERNAL LINKS
  // ═══════════════════════════════════════════════════════════
  openExternal: (url) => {
    // Validate URL before opening (security)
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('mailto:'))) {
      shell.openExternal(url);
    }
  },

  // ═══════════════════════════════════════════════════════════
  // LICENSE MANAGEMENT
  // ═══════════════════════════════════════════════════════════
  activateLicense: (key) => ipcRenderer.send('activate-license', key),
  deactivateLicense: () => ipcRenderer.send('deactivate-license'),
  getLicense: () => ipcRenderer.send('get-license'),
  onLicenseStatus: (callback) => {
    ipcRenderer.on('license-status', (event, data) => callback(data));
  },
  onLicenseResult: (callback) => {
    ipcRenderer.on('license-result', (event, data) => callback(data));
  },

  // ═══════════════════════════════════════════════════════════
  // CONFIG PERSISTENCE
  // ═══════════════════════════════════════════════════════════
  saveConfig: (config) => ipcRenderer.send('save-config', config),
  getConfig: () => ipcRenderer.send('get-config'),
  onLoadConfig: (callback) => {
    ipcRenderer.on('load-config', (event, data) => callback(data));
  },

  // ═══════════════════════════════════════════════════════════
  // SESSION / AUTH
  // ═══════════════════════════════════════════════════════════
  checkSession: (handle) => ipcRenderer.send('check-session', handle),
  removeAccountSession: (handle) => ipcRenderer.send('remove-account-session', handle),
  loginX: (handle) => ipcRenderer.send('login-x', handle),
  logoutX: (handle) => ipcRenderer.send('logout-x', handle),
  onLoginXResult: (callback) => {
    ipcRenderer.on('login-x-result', (event, data) => callback(data));
  },
  onLogoutXResult: (callback) => {
    ipcRenderer.on('logout-x-result', (event, data) => callback(data));
  },
  onSessionStatus: (callback) => {
    ipcRenderer.on('session-status', (event, data) => callback(data));
  },
  onFirstTimeLogin: (callback) => {
    ipcRenderer.on('first-time-login', (event, data) => callback(data));
  },

  // ═══════════════════════════════════════════════════════════
  // CLEANUP PROCESS
  // ═══════════════════════════════════════════════════════════
  startCleanup: (config) => ipcRenderer.send('start-cleanup', config),
  stopCleanup: () => ipcRenderer.send('stop-cleanup'),
  onCleanupProgress: (callback) => {
    ipcRenderer.on('cleanup-progress', (event, data) => callback(data));
  },
  onCleanupLog: (callback) => {
    ipcRenderer.on('cleanup-log', (event, data) => callback(data));
  },
  onCleanupError: (callback) => {
    ipcRenderer.on('cleanup-error', (event, data) => callback(data));
  },
  onCleanupComplete: (callback) => {
    ipcRenderer.on('cleanup-complete', () => callback());
  },

  // ═══════════════════════════════════════════════════════════
  // APP INFO
  // ═══════════════════════════════════════════════════════════
  getAppVersion: () => {
    try {
      return require('./package.json').version;
    } catch {
      return '1.3.5';
    }
  }
});
