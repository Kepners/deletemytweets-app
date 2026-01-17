const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Keep a global reference of the window object
let mainWindow;
let isCleanupRunning = false;

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
      nodeIntegration: false,      // SECURITY: Disabled for safety
      contextIsolation: true,      // SECURITY: Isolate renderer from Node.js
      preload: path.join(__dirname, 'preload.js')  // Secure IPC bridge
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

// Handle cleanup process - spawns CLI as child process (like running in CMD!)
// This avoids Playwright conflicts with Electron's Chromium
const { spawn } = require('child_process');
let cleanupProcess = null;
let cleanupStats = { deleted: 0, protected: 0, skipped: 0, scanned: 0 };

ipcMain.on('start-cleanup', async (event, config) => {
  if (isCleanupRunning) {
    event.reply('cleanup-error', 'Cleanup already running');
    return;
  }

  // Validate license before allowing cleanup
  const license = getLicenseData();
  if (!license || !license.licenseKey || !validateLicenseFormat(license.licenseKey)) {
    event.reply('cleanup-error', 'No valid license found. Please activate a license to use this feature.');
    return;
  }

  isCleanupRunning = true;
  cleanupStats = { deleted: 0, protected: 0, skipped: 0, scanned: 0 };
  const targetCount = parseInt(config.target, 10);

  mainWindow?.webContents.send('cleanup-log', { type: 'info', message: 'Starting cleanup (CLI mode)...' });
  event.reply('cleanup-started');

  // Build environment variables for the CLI
  const env = {
    ...process.env,
    DMT_HANDLE: config.handle,
    DMT_TARGET: config.target.toString(),
    DMT_DELETE_MONTH: config.deleteMonth.toString(),
    DMT_DELETE_YEAR: config.deleteYear.toString(),
    DMT_PROTECT_MONTH: config.protectMonth.toString(),
    DMT_PROTECT_YEAR: config.protectYear.toString(),
    DMT_POSTS: config.posts ? 'true' : 'false',
    DMT_REPLIES: config.replies ? 'true' : 'false',
    DMT_REPOSTS: config.reposts ? 'true' : 'false',
    DMT_SPEED: config.speed || 'normal',
    DMT_HEADLESS: config.headless ? 'true' : 'false',
    DMT_PRIVATE_MODE: config.privateMode ? 'true' : 'false',
    ELECTRON_USER_DATA: app.getPath('userData'),
    // Force colors in output
    FORCE_COLOR: '1'
  };

  // Spawn node index.js as separate process
  const indexPath = path.join(__dirname, 'index.js');
  cleanupProcess = spawn('node', [indexPath], {
    env,
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']  // Pipe stdout and stderr
  });

  // Parse output and send to UI
  const parseAndSend = (data) => {
    const lines = data.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      // Strip ANSI color codes for parsing
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '');

      // Detect log type from content
      let type = 'info';
      if (clean.includes('✗') || clean.includes('DELETED') || clean.includes('deleted')) {
        type = 'delete';
        cleanupStats.deleted++;
      } else if (clean.includes('🛡') || clean.includes('PROTECTED') || clean.includes('protected')) {
        type = 'protect';
        cleanupStats.protected++;
      } else if (clean.includes('⊘') || clean.includes('SKIPPED') || clean.includes('skipped')) {
        type = 'skip';
        cleanupStats.skipped++;
      } else if (clean.includes('ERROR') || clean.includes('Error') || clean.includes('error')) {
        type = 'error';
      } else if (clean.includes('✓') || clean.includes('SUCCESS') || clean.includes('Completed')) {
        type = 'success';
      }

      mainWindow?.webContents.send('cleanup-log', { type, message: clean });

      // Update progress
      mainWindow?.webContents.send('cleanup-progress', {
        scanned: cleanupStats.deleted + cleanupStats.protected + cleanupStats.skipped,
        target: targetCount,
        deleted: cleanupStats.deleted,
        protected: cleanupStats.protected,
        skipped: cleanupStats.skipped
      });
    }
  };

  cleanupProcess.stdout.on('data', parseAndSend);
  cleanupProcess.stderr.on('data', parseAndSend);

  cleanupProcess.on('close', (code) => {
    isCleanupRunning = false;
    cleanupProcess = null;
    mainWindow?.webContents.send('cleanup-log', {
      type: code === 0 ? 'success' : 'info',
      message: `Process exited (code ${code})`
    });
    mainWindow?.webContents.send('cleanup-complete');
  });

  cleanupProcess.on('error', (err) => {
    isCleanupRunning = false;
    cleanupProcess = null;
    mainWindow?.webContents.send('cleanup-log', { type: 'error', message: err.message });
    mainWindow?.webContents.send('cleanup-complete');
  });
});

ipcMain.on('stop-cleanup', () => {
  if (cleanupProcess) {
    cleanupProcess.kill('SIGTERM');
    mainWindow?.webContents.send('cleanup-log', { type: 'info', message: 'Stopping cleanup...' });
  }
  isCleanupRunning = false;
});

// ═══════════════════════════════════════════════════════════
// RUN IN TERMINAL - Launches CLI in separate CMD window
// This is more reliable than running inside Electron
// ═══════════════════════════════════════════════════════════
ipcMain.on('run-in-terminal', async (event, config) => {
  // Validate license first
  const license = getLicenseData();
  if (!license || !license.licenseKey || !validateLicenseFormat(license.licenseKey)) {
    event.reply('terminal-error', 'No valid license found. Please activate a license first.');
    return;
  }

  const { spawn } = require('child_process');

  // Build environment variables for the CLI
  const env = {
    ...process.env,
    DMT_HANDLE: config.handle,
    DMT_TARGET: config.target.toString(),
    DMT_DELETE_MONTH: config.deleteMonth.toString(),
    DMT_DELETE_YEAR: config.deleteYear.toString(),
    DMT_PROTECT_MONTH: config.protectMonth.toString(),
    DMT_PROTECT_YEAR: config.protectYear.toString(),
    DMT_POSTS: config.posts ? 'true' : 'false',
    DMT_REPLIES: config.replies ? 'true' : 'false',
    DMT_REPOSTS: config.reposts ? 'true' : 'false',
    DMT_SPEED: config.speed || 'normal',
    DMT_HEADLESS: config.headless ? 'true' : 'false',
    DMT_PRIVATE_MODE: config.privateMode ? 'true' : 'false'
  };

  // Get path to index.js (in app directory)
  const indexPath = path.join(__dirname, 'index.js');

  // Launch CMD with node index.js
  // /K keeps window open after completion
  const cmd = spawn('cmd.exe', ['/K', 'node', indexPath], {
    env,
    cwd: __dirname,
    detached: true,  // Run independently of Electron
    stdio: 'ignore'  // Don't pipe stdio
  });

  cmd.unref();  // Allow Electron to close without waiting for CMD

  event.reply('terminal-launched', 'CLI launched in terminal window');
});

// Config storage - persist between sessions
const fs = require('fs');
const configPath = path.join(app.getPath('userData'), 'config.json');

// ═══════════════════════════════════════════════════════════
// LICENSE KEY VALIDATION
// ═══════════════════════════════════════════════════════════
const licensePath = path.join(app.getPath('userData'), 'license.json');

// License validation API URL
const LICENSE_API_URL = 'https://deletemytweets.app/api/validate-license';

// Validate license key format: DMT-XXXX-XXXX-XXXX-XXXX
function validateLicenseFormat(key) {
  if (!key || key.length !== 23) return false;
  const pattern = /^DMT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(key.toUpperCase());
}

function getLicenseData() {
  try {
    if (fs.existsSync(licensePath)) {
      return JSON.parse(fs.readFileSync(licensePath, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading license:', err);
  }
  return null;
}

function saveLicenseData(licenseKey) {
  const data = {
    licenseKey: licenseKey.toUpperCase(),
    activatedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(licensePath, JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    console.error('Error saving license:', err);
    return null;
  }
}

function deleteLicenseData() {
  try {
    if (fs.existsSync(licensePath)) {
      fs.unlinkSync(licensePath);
      return true;
    }
  } catch (err) {
    console.error('Error deleting license:', err);
  }
  return false;
}

// Get current license status
ipcMain.on('get-license', (event) => {
  const license = getLicenseData();
  event.reply('license-status', license);
});

// Validate and save a new license key
ipcMain.on('activate-license', async (event, licenseKey) => {
  if (!licenseKey) {
    event.reply('license-result', { success: false, error: 'Please enter a license key' });
    return;
  }

  const cleanKey = licenseKey.toUpperCase().trim();

  // Check format first (quick client-side validation)
  if (!validateLicenseFormat(cleanKey)) {
    event.reply('license-result', {
      success: false,
      error: 'Invalid license key format. Please check and try again.'
    });
    return;
  }

  // Validate against server
  try {
    const fetch = require('node-fetch');
    const response = await fetch(LICENSE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: cleanKey })
    });

    const result = await response.json();

    if (!result.valid) {
      event.reply('license-result', {
        success: false,
        error: result.error || 'Invalid license key. Please check and try again.'
      });
      return;
    }

    // License is valid - save it locally
    const saved = saveLicenseData(cleanKey);
    if (saved) {
      event.reply('license-result', { success: true, license: saved });
    } else {
      event.reply('license-result', { success: false, error: 'Failed to save license' });
    }
  } catch (err) {
    console.error('License validation API error:', err);
    // If API is unreachable, fall back to format-only validation (offline mode)
    // This allows the app to work offline after initial activation
    const existingLicense = getLicenseData();
    if (existingLicense && existingLicense.licenseKey === cleanKey) {
      // Re-activating same key - allow it
      event.reply('license-result', { success: true, license: existingLicense });
    } else {
      event.reply('license-result', {
        success: false,
        error: 'Unable to verify license. Please check your internet connection.'
      });
    }
  }
});

// Deactivate (delete) the current license
ipcMain.on('deactivate-license', (event) => {
  deleteLicenseData();
  event.reply('license-status', null);
});

// Open external URL (for purchase link)
ipcMain.on('open-external', (event, url) => {
  const { shell } = require('electron');
  shell.openExternal(url);
});

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

// Helper to get session path for a handle (uses userData folder)
function getSessionPath(handle) {
  return path.join(app.getPath('userData'), `x_auth_${handle.toLowerCase()}.json`);
}

// Logout of X - clears session file and Edge cookies (no browser needed!)
ipcMain.on('logout-x', async (event, handle) => {
  try {
    // 1. Clear our session file
    if (handle) {
      const sessionPath = getSessionPath(handle);
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
  const sessionPath = getSessionPath(handle);
  const hasSession = fs.existsSync(sessionPath);
  event.reply('session-status', { hasSession, isFirstTime: !hasSession });

  // Show helpful message for first-time users
  if (!hasSession) {
    mainWindow?.webContents.send('first-time-login', { handle });
  }
});

// Remove account session data completely
ipcMain.on('remove-account-session', (event, handle) => {
  if (!handle) return;
  const sessionPath = getSessionPath(handle);
  try {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
      console.log(`Removed session data for @${handle}`);
    }
  } catch (err) {
    console.error('Error removing session:', err);
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
          args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-infobars',
            '--disable-automation'
          ],
          ignoreDefaultArgs: ['--enable-automation']
        }
      );
    } catch (err) {
      // Edge might be open, use fresh browser
      browser = await chromium.launch({
        headless: false,
        channel: 'msedge',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--disable-automation'
        ],
        ignoreDefaultArgs: ['--enable-automation']
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
      // Save session to userData folder (consistent with getSessionPath)
      const sessionPath = getSessionPath(handle);
      await context.storageState({ path: sessionPath });
      console.log(`Session saved to: ${sessionPath}`);

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
