const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Keep a global reference of the window object
let mainWindow;
let isCleanupRunning = false;
let runCleanup = null; // Lazy-load to avoid conflicts with Electron init

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 420,
    height: 980,
    minWidth: 380,
    minHeight: 900,
    icon: path.join(__dirname, 'icon.ico'),
    frame: false, // Frameless for custom titlebar
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: true,
    show: false // Don't show until ready
  });

  // Load the HTML UI
  mainWindow.loadFile('app.html');

  // Show window when ready to prevent flicker
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle window controls from renderer
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

// Handle cleanup process - runs directly in Electron (no Node.js dependency!)
// Track stats for progress updates
let cleanupStats = { deleted: 0, protected: 0, skipped: 0, scanned: 0 };

ipcMain.on('start-cleanup', async (event, config) => {
  if (isCleanupRunning) {
    event.reply('cleanup-error', 'Cleanup already running');
    return;
  }

  // Lazy-load the cleanup module (avoids conflicts during Electron init)
  if (!runCleanup) {
    try {
      const cleanup = require('./index.js');
      runCleanup = cleanup.runCleanup;
    } catch (err) {
      event.reply('cleanup-error', `Failed to load cleanup module: ${err.message}`);
      return;
    }
  }

  isCleanupRunning = true;
  cleanupStats = { deleted: 0, protected: 0, skipped: 0, scanned: 0 };
  mainWindow?.webContents.send('cleanup-log', { type: 'info', message: 'Starting cleanup...' });
  event.reply('cleanup-started');

  const targetCount = parseInt(config.target, 10);

  try {
    await runCleanup(
      {
        handle: config.handle,
        target: targetCount,
        deleteMonth: parseInt(config.deleteMonth, 10),
        deleteYear: parseInt(config.deleteYear, 10),
        protectMonth: parseInt(config.protectMonth, 10),
        protectYear: parseInt(config.protectYear, 10),
        posts: config.posts,
        replies: config.replies,
        reposts: config.reposts,
        speed: config.speed,
        headless: config.headless,  // false = show browser, true = headless
        privateMode: config.privateMode  // true = use fresh browser, false = use Edge profile
      },
      {
        onProgress: ({ current, total, tab }) => {
          cleanupStats.scanned = current;
          // Send progress with all stats app.html expects
          mainWindow?.webContents.send('cleanup-progress', {
            scanned: current,
            target: targetCount,
            deleted: cleanupStats.deleted,
            protected: cleanupStats.protected,
            skipped: cleanupStats.skipped
          });
        },
        onLog: ({ type, message }) => {
          // Parse log messages to extract stats
          let statsChanged = false;
          if (message.includes('DELETED')) {
            cleanupStats.deleted++;
            statsChanged = true;
          } else if (message.includes('PROTECTED') || message.includes('Protecting')) {
            cleanupStats.protected++;
            statsChanged = true;
          } else if (message.includes('SKIPPED') || message.includes('Skipping')) {
            cleanupStats.skipped++;
            statsChanged = true;
          }
          mainWindow?.webContents.send('cleanup-log', { type, message });

          // Send updated stats to UI immediately after deletion/protection/skip
          if (statsChanged) {
            mainWindow?.webContents.send('cleanup-progress', {
              scanned: cleanupStats.scanned,
              target: targetCount,
              deleted: cleanupStats.deleted,
              protected: cleanupStats.protected,
              skipped: cleanupStats.skipped
            });
          }
        },
        onComplete: ({ deleted, target, elapsed }) => {
          cleanupStats.deleted = deleted;
          mainWindow?.webContents.send('cleanup-log', { type: 'success', message: `Completed: ${deleted}/${target} tweets deleted in ${elapsed}s` });
        }
      }
    );

    isCleanupRunning = false;
    mainWindow?.webContents.send('cleanup-complete');
  } catch (err) {
    isCleanupRunning = false;
    mainWindow?.webContents.send('cleanup-log', { type: 'error', message: err.message || String(err) });
    mainWindow?.webContents.send('cleanup-complete');
  }
});

ipcMain.on('stop-cleanup', () => {
  // Note: Can't easily stop async cleanup - would need AbortController
  // For now, user can close the app
  isCleanupRunning = false;
});

// Config storage - persist between sessions
const fs = require('fs');
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    console.error('Error saving config:', err);
  }
}

ipcMain.on('get-config', (event) => {
  const config = loadConfig();
  event.reply('load-config', config);
});

ipcMain.on('save-config', (event, config) => {
  saveConfig(config);
});

// Clear saved session for a handle
ipcMain.on('clear-session', (event, handle) => {
  if (!handle) return;
  const sessionPath = path.join(__dirname, `x_auth_${handle.toLowerCase()}.json`);
  try {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      console.log(`Cleared session for @${handle}`);
    }
  } catch (err) {
    console.error('Error clearing session:', err);
  }
});

// Logout of X - clears session file and Edge cookies (no browser needed!)
ipcMain.on('logout-x', async (event, handle) => {
  try {
    // 1. Clear our session file
    if (handle) {
      const sessionPath = path.join(__dirname, `x_auth_${handle.toLowerCase()}.json`);
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
        console.log(`Cleared session file for @${handle}`);
      }
    }

    // 2. Clear X cookies directly from Edge's SQLite database (no browser needed!)
    const userDataDir = process.env.EDGE_USER_DATA || path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data');
    const profileDir = process.env.EDGE_PROFILE || 'Default';
    const cookiesPath = path.join(userDataDir, profileDir, 'Network', 'Cookies');

    let cookiesCleared = false;
    if (fs.existsSync(cookiesPath)) {
      try {
        // Use better-sqlite3 to delete X cookies
        const Database = require('better-sqlite3');
        const db = new Database(cookiesPath);

        // Delete all cookies for x.com and twitter.com
        const result = db.prepare(`
          DELETE FROM cookies
          WHERE host_key LIKE '%x.com%'
             OR host_key LIKE '%twitter.com%'
        `).run();

        db.close();
        cookiesCleared = true;
        console.log(`Cleared ${result.changes} Edge cookies for X/Twitter`);
      } catch (dbErr) {
        // Database might be locked (Edge is open)
        console.log('Could not clear Edge cookies (Edge may be open):', dbErr.message);
      }
    }

    if (cookiesCleared) {
      event.reply('logout-x-result', { success: true, message: 'Logged out! Session + Edge cookies cleared.' });
    } else {
      event.reply('logout-x-result', { success: true, message: 'Session cleared. Close Edge to fully logout.' });
    }
  } catch (err) {
    console.error('Logout error:', err);
    event.reply('logout-x-result', { success: false, message: err.message || 'Logout failed' });
  }
});

// Check if session exists for a handle
ipcMain.on('check-session', (event, handle) => {
  if (!handle) {
    event.reply('session-status', { hasSession: false });
    return;
  }
  const sessionPath = path.join(__dirname, `x_auth_${handle.toLowerCase()}.json`);
  const hasSession = fs.existsSync(sessionPath);
  event.reply('session-status', { hasSession, isFirstTime: !hasSession });

  // Show helpful message for first-time users
  if (!hasSession) {
    mainWindow?.webContents.send('first-time-login', { handle });
  }
});

// Login to X - opens browser for manual login
ipcMain.on('login-x', async (event, handle) => {
  const { chromium } = require('playwright');

  try {
    // Launch Edge with user profile
    const userDataDir = process.env.EDGE_USER_DATA || path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data');
    const profileDir = process.env.EDGE_PROFILE || 'Default';

    let context, browser;
    try {
      context = await chromium.launchPersistentContext(
        path.join(userDataDir, profileDir),
        {
          headless: false,
          channel: 'msedge',
          args: ['--disable-blink-features=AutomationControlled', '--disable-infobars']
        }
      );
    } catch (err) {
      // Edge might be open, use fresh browser
      browser = await chromium.launch({
        headless: false,
        channel: 'msedge',
        args: ['--disable-blink-features=AutomationControlled', '--disable-infobars']
      });
      context = await browser.newContext();
    }

    const page = context.pages()[0] || await context.newPage();

    // Navigate to X login
    await page.goto('https://x.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for user to log in (check for auth_token cookie every 2 seconds, up to 5 minutes)
    const maxWait = 5 * 60 * 1000;
    const start = Date.now();
    let loggedIn = false;

    while (Date.now() - start < maxWait) {
      const cookies = await context.cookies();
      if (cookies.some(c => c.name.toLowerCase() === 'auth_token')) {
        loggedIn = true;
        break;
      }
      await page.waitForTimeout(2000);
    }

    if (loggedIn) {
      // Save session
      const sessionPath = path.join(__dirname, `x_auth_${handle.toLowerCase()}.json`);
      await context.storageState({ path: sessionPath });

      if (browser) await browser.close();
      else await context.close();

      event.reply('login-x-result', { success: true, message: `Logged in as @${handle}!` });
    } else {
      if (browser) await browser.close();
      else await context.close();

      event.reply('login-x-result', { success: false, message: 'Login timed out' });
    }
  } catch (err) {
    console.error('Login error:', err);
    event.reply('login-x-result', { success: false, message: err.message || 'Login failed' });
  }
});
