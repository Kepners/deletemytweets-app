#!/usr/bin/env node
// deletemytweets — Date-filtered tweet deletion tool for X (Twitter)
// Safely delete old tweets while protecting recent ones
// https://github.com/Kepners/deletemytweets

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

// Check if running in CLI mode (not embedded in Electron)
const IS_CLI = require.main === module;

// Modern UI libraries (only load for CLI mode)
let chalk, boxen, ora, cliProgress, figlet, gradient;
if (IS_CLI) {
  chalk = require("chalk");
  boxen = require("boxen");
  ora = require("ora");
  cliProgress = require("cli-progress");
  figlet = require("figlet");
  gradient = require("gradient-string");
} else {
  // Stubs for embedded mode - recursive proxy to handle any chain like chalk.red.bold.underline(text)
  const createChalkProxy = () => {
    const handler = {
      get: () => createChalkProxy(),
      apply: (target, thisArg, args) => args[0] || ''
    };
    return new Proxy(function(s) { return s || ''; }, handler);
  };
  chalk = createChalkProxy();

  // ora stub - returns spinner object with all methods
  ora = () => {
    const spinner = {
      start: () => spinner,
      stop: () => spinner,
      succeed: () => spinner,
      fail: () => spinner,
      warn: () => spinner,
      info: () => spinner,
      text: ''
    };
    return spinner;
  };

  // boxen stub
  boxen = (text) => text;

  // cliProgress stub
  cliProgress = {
    SingleBar: class { start() {} stop() {} update() {} },
    Presets: { shades_classic: {} }
  };

  // figlet stub
  figlet = { textSync: (s) => s };
}

// ================= TERMINAL UI =================
// Only create gradients in CLI mode
let xGradient, deleteGradient, successGradient;
if (IS_CLI) {
  xGradient = gradient(['#1DA1F2', '#14171A']); // Twitter blue to black
  deleteGradient = gradient(['#ff6b6b', '#ee5a24']);
  successGradient = gradient(['#2ecc71', '#27ae60']);
} else {
  xGradient = deleteGradient = successGradient = { multiline: (s) => s };
}

function printHeader() {
  if (!IS_CLI) return;
  console.clear();
  console.log("");

  // ASCII art logo with gradient
  const logo = figlet.textSync('DeleteMyTweets', {
    font: 'Small',
    horizontalLayout: 'default'
  });
  console.log(xGradient(logo));

  // Tagline box
  const tagline = boxen(
    chalk.white.bold('Delete Old Tweets by Year') + '\n' +
    chalk.gray('Safely clean your Twitter history'),
    {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: { top: 0, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'cyan',
      textAlignment: 'center'
    }
  );
  console.log(tagline);
}

function printConfig(config) {
  if (!IS_CLI) return;
  const { handle, target, deleteMonth, deleteYear, protectMonth, protectYear, posts, replies, reposts, speed } = config;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const deleteDate = `${months[deleteMonth - 1]} ${deleteYear}`;
  const protectDate = `${months[protectMonth - 1]} ${protectYear}`;
  const speedLabel = speed === 'aggressive' ? 'Aggressive' : speed === 'conservative' ? 'Conservative' : 'Normal';

  const configBox = boxen(
    chalk.bold.cyan('  CONFIGURATION\n') +
    chalk.gray('  ─────────────────────────────────\n') +
    `  ${chalk.cyan('Profile')}       ${chalk.white('@' + chalk.bold(handle))}\n` +
    `  ${chalk.cyan('Target')}        ${chalk.bold.white(target)} tweets\n` +
    `  ${chalk.red('Delete')}        Before ${deleteDate}\n` +
    `  ${chalk.green('Protect')}       After ${protectDate}\n` +
    `  ${chalk.cyan('Speed')}         ${speedLabel}\n` +
    chalk.gray('  ─────────────────────────────────\n') +
    `  ${chalk.cyan('Posts')}         ${posts ? chalk.green('✓ YES') : chalk.gray('✗ NO')}\n` +
    `  ${chalk.cyan('Replies')}       ${replies ? chalk.green('✓ YES') : chalk.gray('✗ NO')}\n` +
    `  ${chalk.cyan('Reposts')}       ${reposts ? chalk.green('✓ YES') : chalk.gray('✗ NO')}`,
    {
      padding: 1,
      margin: { top: 0, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'gray'
    }
  );
  console.log(configBox);
}

// Callback for GUI mode logging
let onLogCallback = null;

// Abort controller for stopping cleanup
let abortController = null;

function isAborted() {
  return abortController && abortController.signal.aborted;
}

function abortCleanup() {
  if (abortController) {
    abortController.abort();
  }
}

function log(type, message, extra = "") {
  const plainMessage = `${message}${extra ? ' ' + extra : ''}`;

  // Send to GUI callback if set
  if (onLogCallback) {
    onLogCallback({ type, message: plainMessage });
  }

  // Only show in CLI mode
  if (!IS_CLI) return;

  const timestamp = chalk.gray(new Date().toLocaleTimeString("en-US", { hour12: false }));
  const icons = {
    info: chalk.blue('ℹ'),
    success: chalk.green('✓'),
    warn: chalk.yellow('⚠'),
    error: chalk.red('✗'),
    delete: chalk.red('🗑'),
    protect: chalk.green('🛡'),
    skip: chalk.gray('○'),
    tab: chalk.magenta('→'),
  };
  const icon = icons[type] || chalk.gray('·');
  const extraText = extra ? chalk.gray(` ${extra}`) : '';
  console.log(`${timestamp} ${icon} ${message}${extraText}`);
}

function printSummary(removed, target, startTime) {
  if (!IS_CLI) return;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rate = removed > 0 ? (elapsed / removed).toFixed(1) : 0;
  const percent = Math.round((removed / target) * 100);

  console.log("");

  const summaryBox = boxen(
    successGradient.multiline('  COMPLETE!\n') +
    chalk.gray('  ═══════════════════════════════\n') +
    `  ${chalk.cyan('Deleted')}      ${chalk.bold.green(removed)} / ${target} (${percent}%)\n` +
    `  ${chalk.cyan('Time')}         ${elapsed} seconds\n` +
    `  ${chalk.cyan('Speed')}        ${rate}s per tweet\n` +
    chalk.gray('  ═══════════════════════════════'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'green',
      title: '✓ Summary',
      titleAlignment: 'center'
    }
  );
  console.log(summaryBox);
}

// Progress bar instance
let progressBar = null;
// Callback for GUI mode
let onProgressCallback = null;

function createProgressBar(total) {
  if (!IS_CLI) return;
  progressBar = new cliProgress.SingleBar({
    format: '  {bar} | {percentage}% | {value}/{total} tweets | {tab}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
    clearOnComplete: false,
    barsize: 25,
    forceRedraw: true
  }, cliProgress.Presets.shades_classic);
  progressBar.start(total, 0, { tab: '' });
}

function updateProgress(current, tab, total) {
  if (IS_CLI && progressBar) {
    progressBar.update(current, { tab });
  }
  if (onProgressCallback) {
    onProgressCallback({ current, total, tab });
  }
}

function stopProgress() {
  if (!IS_CLI) return;
  if (progressBar) {
    progressBar.stop();
    progressBar = null;
  }
}

// ================= CONFIG FILE =================
const CONFIG_FILE = path.resolve(__dirname, "deletemytweets_config.json");
const SESSION_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days (long sessions for all-day runs)

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {}
}

// Get storage file path for specific handle
// Use app's userData folder in Electron, or __dirname for CLI
function getStoragePath(handle) {
  // Check if running in Electron
  let basePath = __dirname;
  try {
    const { app } = require('electron');
    if (app && app.getPath) {
      basePath = app.getPath('userData');
    }
  } catch {
    // Not in Electron main process, check if we can get userData from env
    if (process.env.ELECTRON_USER_DATA) {
      basePath = process.env.ELECTRON_USER_DATA;
    }
  }
  return path.resolve(basePath, `x_auth_${handle.toLowerCase()}.json`);
}

// Check if session is valid (exists and not expired)
function isSessionValid(handle) {
  const storagePath = getStoragePath(handle);
  if (!fs.existsSync(storagePath)) return false;

  try {
    const stat = fs.statSync(storagePath);
    const age = Date.now() - stat.mtimeMs;
    if (age > SESSION_EXPIRY_MS) {
      // Session expired, delete it
      fs.unlinkSync(storagePath);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Clear session for a handle
function clearSession(handle) {
  const storagePath = getStoragePath(handle);
  try {
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
  } catch {}
}

const savedConfig = loadConfig();

// ================= CONFIG =================
// Speed presets for delay between deletions
const SPEED_PRESETS = {
  aggressive:   { min: 600, max: 1000 },   // Fast but risky
  normal:       { min: 1200, max: 2200 },  // Balanced (default)
  conservative: { min: 2500, max: 4000 }   // Slow but safe
};

// Config variables (set by runCleanup or CLI)
let PROFILE_HANDLE = null;
let INCLUDE_POSTS = true;
let INCLUDE_REPLIES = true;
let HANDLE_REPOSTS = false;
let TARGET = 10000;  // Default to large batch for "set and forget" usage
let HEADLESS = false;
let PRIVATE_MODE = false;  // Use fresh browser instead of Edge profile
let SPEED = "normal";
let MIN_DELAY_MS = 1200;
let MAX_DELAY_MS = 2200;
let LOGIN_WAIT_MS = 3 * 60 * 1000;
let STORAGE = path.resolve(__dirname, "x_auth_storage.json");
let MAX_SCROLL_PASSES = 100;  // Increased for large accounts (31K+ tweets)
let SCROLL_MIN_WAIT_MS = 200;
let SCROLL_MAX_WAIT_MS = 400;
let SCROLL_STEP_RATIO = 0.92;
let RETURN_TO_TOP = false;
let DELETE_MONTH = 12;
let DELETE_YEAR = 2014;
let PROTECT_MONTH = 1;
let PROTECT_YEAR = 2025;
let DELETE_BEFORE = null;
let PROTECT_AFTER = null;

// Parse config from environment (CLI mode only)
function parseEnvConfig() {
  // Support DMT_* env vars from Electron app, plus legacy names
  PROFILE_HANDLE = process.env.DMT_HANDLE || process.env.PROFILE_HANDLE || process.argv[2] || savedConfig.handle;

  if (!PROFILE_HANDLE) {
    printHeader();

    const errorBox = boxen(
      chalk.red.bold('ERROR: Profile handle is required!\n\n') +
      chalk.white.bold('Usage:\n') +
      chalk.cyan('  node index.js ') + chalk.yellow('<your_handle>\n') +
      chalk.cyan('  PROFILE_HANDLE=') + chalk.yellow('handle') + chalk.cyan(' node index.js\n\n') +
      chalk.white.bold('Example:\n') +
      chalk.gray('  node index.js johndoe\n') +
      chalk.gray('  TARGET=100 DELETE_YEAR_AND_OLDER=2020 node index.js johndoe'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red',
        title: '✗ Error',
        titleAlignment: 'center'
      }
    );
    console.log(errorBox);
    process.exit(1);
  }

  // Save handle for next time
  if (PROFILE_HANDLE !== savedConfig.handle) {
    saveConfig({ ...savedConfig, handle: PROFILE_HANDLE });
  }

  INCLUDE_POSTS = (process.env.DMT_POSTS ?? process.env.INCLUDE_POSTS ?? "true") === "true";
  INCLUDE_REPLIES = (process.env.DMT_REPLIES ?? process.env.INCLUDE_REPLIES ?? "true") === "true";
  HANDLE_REPOSTS = (process.env.DMT_REPOSTS ?? process.env.HANDLE_REPOSTS ?? "false") === "true";

  TARGET = parseInt(process.env.DMT_TARGET ?? process.env.TARGET ?? "10000", 10);
  HEADLESS = (process.env.DMT_HEADLESS ?? process.env.HEADLESS ?? "false") === "true";
  PRIVATE_MODE = (process.env.DMT_PRIVATE_MODE ?? process.env.PRIVATE_MODE ?? "false") === "true";
  SPEED = process.env.DMT_SPEED ?? process.env.SPEED ?? "normal";

  const delays = SPEED_PRESETS[SPEED] || SPEED_PRESETS.normal;
  MIN_DELAY_MS = parseInt(process.env.MIN_DELAY_MS ?? String(delays.min), 10);
  MAX_DELAY_MS = parseInt(process.env.MAX_DELAY_MS ?? String(delays.max), 10);

  LOGIN_WAIT_MS = parseInt(process.env.LOGIN_WAIT_MS ?? String(3 * 60 * 1000), 10);
  STORAGE = path.resolve(__dirname, "x_auth_storage.json");

  MAX_SCROLL_PASSES = parseInt(process.env.MAX_SCROLL_PASSES ?? "5", 10);
  SCROLL_MIN_WAIT_MS = parseInt(process.env.SCROLL_MIN_WAIT_MS ?? "300", 10);
  SCROLL_MAX_WAIT_MS = parseInt(process.env.SCROLL_MAX_WAIT_MS ?? "600", 10);
  SCROLL_STEP_RATIO = parseFloat(process.env.SCROLL_STEP_RATIO ?? "0.92");
  RETURN_TO_TOP = (process.env.RETURN_TO_TOP ?? "false") === "true";

  DELETE_MONTH = parseInt(process.env.DMT_DELETE_MONTH ?? process.env.DELETE_MONTH ?? "12", 10);
  DELETE_YEAR = parseInt(process.env.DMT_DELETE_YEAR ?? process.env.DELETE_YEAR ?? process.env.DELETE_YEAR_AND_OLDER ?? "2014", 10);
  PROTECT_MONTH = parseInt(process.env.DMT_PROTECT_MONTH ?? process.env.PROTECT_MONTH ?? "01", 10);
  PROTECT_YEAR = parseInt(process.env.DMT_PROTECT_YEAR ?? process.env.PROTECT_YEAR ?? process.env.PROTECT_YEAR_AND_NEWER ?? "2025", 10);

  DELETE_BEFORE = new Date(DELETE_YEAR, DELETE_MONTH - 1, 1);
  PROTECT_AFTER = new Date(PROTECT_YEAR, PROTECT_MONTH - 1, 1);
}


const RE_DELETE = /(Delete|Eliminar|Supprimer|Löschen|Elimina|Excluir|Удалить|削除|삭제|刪除)/i;
const RE_UNDO_REPOST = /(Undo\s+(Repost|Retweet)|Unretweet|Deshacer\s+Repost|Annuler\s+Retweet|zurücknehmen|Desfazer|Отменить|취소|转推)/i;

// ================= UTILITIES =================
function rand(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function pause(minMs, maxMs) { await sleep(rand(minMs, maxMs)); }

// Timeout wrapper to prevent hanging on video tweets
async function withTimeout(promise, ms = 3000, fallback = null) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
}

// Pause all videos on page to prevent resource drain and stalling
async function pauseAllVideos(page) {
  try {
    await page.evaluate(() => {
      document.querySelectorAll('video').forEach(v => {
        v.pause();
        v.currentTime = 0;
        v.preload = 'none';
      });
    });
  } catch {}
}

// Dismiss common X/Twitter popups that can block interactions
async function dismissPopups(page) {
  try {
    // Cookie consent - "Accept all cookies" or close button
    const cookieSelectors = [
      '[data-testid="BottomBar"] button:has-text("Accept")',
      'button:has-text("Accept all cookies")',
      'button:has-text("Accept cookies")',
      '[aria-label="Close"]'
    ];

    // Premium/subscription prompts
    const premiumSelectors = [
      '[data-testid="sheetDialog"] [aria-label="Close"]',
      '[role="dialog"] button[aria-label="Close"]',
      'button:has-text("Not now")',
      'button:has-text("Maybe later")'
    ];

    // Notification prompts
    const notificationSelectors = [
      'button:has-text("Not now")',
      '[data-testid="app-bar-close"]'
    ];

    // General modal close buttons
    const closeSelectors = [
      '[data-testid="app-bar-close"]',
      '[data-testid="xMigrationBottomBar"] button',
      '[role="dialog"] [aria-label="Close"]',
      'div[data-testid="confirmationSheetCancel"]'
    ];

    const allSelectors = [...cookieSelectors, ...premiumSelectors, ...notificationSelectors, ...closeSelectors];

    for (const selector of allSelectors) {
      try {
        const el = page.locator(selector).first();
        const count = await el.count().catch(() => 0);
        if (count > 0 && await el.isVisible().catch(() => false)) {
          await el.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(300);
        }
      } catch {}
    }

    // Also try pressing Escape to close any modal
    await page.keyboard.press('Escape').catch(() => {});

  } catch {}
}

// ================= AUTH =================
async function isLoggedIn(context) {
  try { return (await context.cookies()).some(c => c.name.toLowerCase() === "auth_token"); }
  catch { return false; }
}

// Sign out of X/Twitter completely
async function signOut(page, context) {
  log("info", "Signing out of X...");
  try {
    // Clear all cookies first
    await context.clearCookies();

    // Navigate to logout page
    await page.goto('https://x.com/logout', { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Click the logout confirmation button if present
    const confirmSelectors = [
      '[data-testid="confirmationSheetConfirm"]',
      'button:has-text("Log out")',
      '[role="button"]:has-text("Log out")'
    ];

    for (const selector of confirmSelectors) {
      const btn = page.locator(selector);
      const count = await btn.count().catch(() => 0);
      if (count > 0) {
        await btn.first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
        break;
      }
    }

    // Clear cookies again after logout
    await context.clearCookies();

    // Verify we're logged out
    const stillLoggedIn = await isLoggedIn(context);
    if (stillLoggedIn) {
      log("warn", "Cookies still present after logout - clearing again");
      await context.clearCookies();
    }

    log("success", "Signed out successfully");
    return true;
  } catch (err) {
    log("warn", `Sign out error: ${err?.message || err}`);
    // Still try to clear cookies
    await context.clearCookies().catch(() => {});
    return false;
  }
}

// Get the currently logged-in account handle from the sidebar
async function getLoggedInHandle(page) {
  try {
    // Look for the account switcher in the sidebar which shows current handle
    const accountSelectors = [
      '[data-testid="SideNav_AccountSwitcher_Button"] [dir="ltr"] span',  // Sidebar account button
      '[data-testid="AccountSwitcher"] span[dir="ltr"]',
      'nav [data-testid="AppTabBar_Profile_Link"]',  // Profile link in nav
      'a[href*="/"][data-testid="AppTabBar_Profile_Link"]'
    ];

    for (const selector of accountSelectors) {
      const el = page.locator(selector);
      const count = await el.count().catch(() => 0);
      if (count > 0) {
        const text = await el.first().innerText().catch(() => '');
        // Extract handle (starts with @)
        const match = text.match(/@(\w+)/);
        if (match) return match[1].toLowerCase();
      }
    }

    // Try to get from profile link href
    const profileLink = page.locator('[data-testid="AppTabBar_Profile_Link"]');
    const href = await profileLink.getAttribute('href').catch(() => null);
    if (href) {
      const match = href.match(/^\/(\w+)$/);
      if (match) return match[1].toLowerCase();
    }

    return null;
  } catch {
    return null;
  }
}

// Verify the logged-in account matches the expected handle
async function verifyAccount(page, expectedHandle) {
  try {
    // Check if we're on the right profile by looking at the URL or page content
    log("info", `Navigating to profile @${expectedHandle}...`);
    await page.goto(`https://x.com/${expectedHandle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000); // Give page time to fully load

    // FIRST: Check who is actually logged in via sidebar
    const loggedInAs = await getLoggedInHandle(page);
    if (loggedInAs) {
      if (loggedInAs === expectedHandle.toLowerCase()) {
        log("success", `Confirmed logged in as @${loggedInAs}`);
      } else {
        log("error", `WRONG ACCOUNT! Logged in as @${loggedInAs}, but expected @${expectedHandle}`);
        return false;
      }
    }

    // Strategy 1: Look for "Edit profile" button (multiple possible selectors)
    const editSelectors = [
      '[data-testid="editProfileButton"]',           // Most reliable - data-testid
      'a[href="/settings/profile"]',                  // Direct link
      'button:has-text("Edit profile")',              // Button with text
      'a:has-text("Edit profile")',                   // Link with text
      '[aria-label="Edit profile"]'                   // Aria label
    ];

    for (const selector of editSelectors) {
      const el = page.locator(selector);
      const count = await el.count().catch(() => 0);
      if (count > 0) {
        log("success", `Found edit profile button (${selector})`);
        return true;
      }
    }

    // Strategy 2: Check if there's NO "Follow" button (means it's our profile)
    const followSelectors = [
      '[data-testid="followButton"]',
      'button:has-text("Follow")',
      '[aria-label*="Follow @"]'
    ];

    let hasFollowButton = false;
    for (const selector of followSelectors) {
      const el = page.locator(selector);
      const count = await el.count().catch(() => 0);
      if (count > 0) {
        const text = await el.first().innerText().catch(() => '');
        // "Following" is okay (we follow ourselves? no), but "Follow" means it's not our profile
        if (text === 'Follow') {
          log("warn", `Found Follow button - this is NOT our profile`);
          hasFollowButton = true;
          break;
        }
      }
    }

    if (hasFollowButton) {
      return false;
    }

    // Strategy 3: If we confirmed logged-in handle matches, trust that
    if (loggedInAs && loggedInAs === expectedHandle.toLowerCase()) {
      return true;
    }

    // Strategy 4: Check URL matches expected handle (case-insensitive) - ONLY if edit button found
    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes(`x.com/${expectedHandle.toLowerCase()}`)) {
      // Without Edit button AND without logged-in confirmation, this is NOT safe
      log("warn", `On profile URL but could not confirm account ownership`);
      log("warn", `Please ensure you are logged in as @${expectedHandle}`);
      return false;  // Changed from true - don't assume!
    }

    log("warn", `Could not verify profile ownership - URL: ${page.url()}`);
    return false;
  } catch (err) {
    log("error", `verifyAccount error: ${err?.message || err}`);
    return false;
  }
}

async function waitForLogin(page, context, spinner, storagePath) {
  const start = Date.now();
  while (Date.now() - start < LOGIN_WAIT_MS) {
    if (await isLoggedIn(context)) {
      try { await context.storageState({ path: storagePath }); } catch {}
      spinner.succeed(chalk.green('Session saved'));
      return true;
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

async function ensureLoggedIn(page, context) {
  const storagePath = getStoragePath(PROFILE_HANDLE);

  // Navigate to X first to pick up any existing Edge session cookies
  log("info", "Checking X login status...");
  try {
    await page.goto('https://x.com/home', { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000); // Let cookies settle
  } catch {
    // Might redirect to login if not authenticated - that's fine
  }

  // Now check if logged in (from Edge profile or saved session)
  if (await isLoggedIn(context)) {
    log("info", `Verifying account is @${PROFILE_HANDLE}...`);
    const isCorrectAccount = await verifyAccount(page, PROFILE_HANDLE);

    if (isCorrectAccount) {
      log("success", chalk.green(`Verified: logged in as @${PROFILE_HANDLE}`));
      // Save/update session file for this handle
      try { await context.storageState({ path: storagePath }); } catch {}
      return true;
    } else {
      // Logged in but wrong account - sign out and force re-login
      log("warn", chalk.yellow(`Logged in as wrong account! Need @${PROFILE_HANDLE}`));
      clearSession(PROFILE_HANDLE);

      // Use proper sign out
      await signOut(page, context);

      // Navigate to login page
      await page.goto('https://x.com/login', { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
    }
  } else {
    // Not logged in at all
    log("info", `Not logged in. Please log in as @${PROFILE_HANDLE}`);
  }

  const spinner = ora({
    text: chalk.yellow(`Please log in as @${PROFILE_HANDLE}...`),
    spinner: 'dots12'
  }).start();

  // Go to X login page
  await page.goto('https://x.com/login', { waitUntil: "domcontentloaded" }).catch(() => {});

  // Give it a moment to settle
  await page.waitForTimeout(2000);

  spinner.text = chalk.yellow(`Waiting for @${PROFILE_HANDLE} login (${Math.round(LOGIN_WAIT_MS / 1000)}s timeout)...`);

  const ok = await waitForLogin(page, context, spinner, storagePath);
  if (ok) {
    // Verify the account after login
    const isCorrect = await verifyAccount(page, PROFILE_HANDLE);
    if (!isCorrect) {
      spinner.fail(chalk.red(`Logged in as wrong account! Need @${PROFILE_HANDLE}`));
      clearSession(PROFILE_HANDLE);
      return false;
    }
    return true;
  }

  // In GUI mode, keep waiting for login (no stdin available)
  if (!IS_CLI) {
    spinner.text = chalk.yellow(`Waiting for login... Complete login in the browser window`);
    log("info", "Please log in to X/Twitter in the browser window that opened");

    // Extended wait for GUI mode - check every 2 seconds for up to 5 minutes
    const extendedWaitMs = 5 * 60 * 1000;
    const extendedStart = Date.now();
    while (Date.now() - extendedStart < extendedWaitMs) {
      if (await isLoggedIn(context)) {
        const isCorrect = await verifyAccount(page, PROFILE_HANDLE);
        if (isCorrect) {
          try { await context.storageState({ path: storagePath }); } catch {}
          spinner.succeed(chalk.green(`Logged in as @${PROFILE_HANDLE}`));
          log("success", `Successfully logged in as @${PROFILE_HANDLE}`);
          return true;
        } else {
          log("warn", `Logged in as wrong account! Need @${PROFILE_HANDLE}`);
          clearSession(PROFILE_HANDLE);
          // Keep waiting for correct account
        }
      }
      await page.waitForTimeout(2000);
    }

    spinner.fail(chalk.red('Login timeout'));
    log("error", "Login timeout - please try again");
    return false;
  }

  // CLI mode: wait for Enter key
  spinner.warn(chalk.yellow('Still waiting... Press Enter after logging in.'));
  await new Promise(res => { process.stdin.resume(); process.stdin.once("data", res); });

  // Give it a moment after pressing Enter
  await new Promise(r => setTimeout(r, 2000));

  if (await isLoggedIn(context)) {
    // Verify account after manual login
    const isCorrect = await verifyAccount(page, PROFILE_HANDLE);
    if (!isCorrect) {
      log("error", chalk.red(`Wrong account! Need @${PROFILE_HANDLE}`));
      clearSession(PROFILE_HANDLE);
      return false;
    }

    try {
      await context.storageState({ path: storagePath });
      log("success", chalk.green(`Session saved for @${PROFILE_HANDLE}`));
    } catch (e) {
      log("warn", `Could not save session: ${e.message}`);
    }
    return true;
  }

  log("warn", chalk.yellow('Login not detected'));
  return false;
}

// ================= NAVIGATION =================
async function gotoProfileTab(page, tab) {
  const url = tab === "Replies"
    ? `https://x.com/${PROFILE_HANDLE}/with_replies`
    : `https://x.com/${PROFILE_HANDLE}`;

  const spinner = ora({
    text: chalk.cyan(`Loading ${tab}...`),
    spinner: 'dots12'
  }).start();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("main", { timeout: 30000 });

    const currentUrl = page.url();
    if (!currentUrl.includes(PROFILE_HANDLE)) {
      spinner.text = chalk.yellow('Retrying navigation...');
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
    }

    // Dismiss any popups that appeared (cookie banners, premium prompts, etc)
    await dismissPopups(page);

    spinner.succeed(chalk.green(`Loaded @${PROFILE_HANDLE}/${tab}`));
  } catch (err) {
    spinner.fail(chalk.red(`Navigation failed: ${err.message}`));
    throw err;
  }
}

function allCards(page) {
  return page.locator('article[data-testid="tweet"], article[role="article"]');
}

// ================= DATE EXTRACTION =================
async function getTweetDate(card) {
  try {
    const timeEl = card.locator('[data-testid="User-Name"] time[datetime]').first();
    const timeCount = await withTimeout(timeEl.count(), 2000, 0);
    if (timeCount === 0) {
      const statusLink = card.locator('a[href*="/status/"] time[datetime]').first();
      const statusCount = await withTimeout(statusLink.count(), 2000, 0);
      if (statusCount === 0) return null;
      const datetime = await withTimeout(statusLink.getAttribute('datetime'), 2000, null);
      if (!datetime) return null;
      const date = new Date(datetime);
      if (isNaN(date.getTime())) return null;
      return date;
    }

    const datetime = await withTimeout(timeEl.getAttribute('datetime'), 2000, null);
    if (!datetime) return null;
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

async function shouldDeleteByDate(card) {
  const tweetDate = await getTweetDate(card);

  let preview = "";
  try {
    const tweetText = await withTimeout(
      card.locator('[data-testid="tweetText"]').first().innerText().catch(() => ""),
      2000, ""
    );
    preview = (tweetText || "").substring(0, 40).replace(/\n/g, " ");
    if ((tweetText || "").length > 40) preview += "...";
  } catch {}

  if (tweetDate === null) {
    log("warn", `Unknown date, skipping`, `"${preview}"`);
    return false;
  }

  const dateStr = formatDate(tweetDate);

  // Protect tweets on or after the protect date
  if (tweetDate >= PROTECT_AFTER) {
    log("protect", chalk.green(`${dateStr} Protected`), chalk.gray(`"${preview}"`));
    return false;
  }

  // Delete tweets FROM the delete date onwards (up to protection date)
  if (tweetDate >= DELETE_BEFORE) {
    log("delete", chalk.red(`${dateStr} → DELETE`), chalk.gray(`"${preview}"`));
    return true;
  }

  // Tweets older than delete date are skipped (kept)
  log("skip", chalk.gray(`${dateStr} Too old, kept`), chalk.gray(`"${preview}"`));
  return false;
}

// ================= TWEET OPERATIONS =================

// Check if this card shows a repost by the current user
async function isUserRepost(card) {
  try {
    // Look for "Reposted" or "retweeted" indicator with user's link
    const socialContext = card.locator('[data-testid="socialContext"]');
    const contextCount = await withTimeout(socialContext.count(), 1000, 0);
    if (contextCount > 0) {
      const contextText = await withTimeout(socialContext.first().innerText().catch(() => ""), 1000, "");
      // Check if it says "You reposted" or has the user's handle
      if (contextText && (contextText.toLowerCase().includes('repost') || contextText.toLowerCase().includes('retweet'))) {
        return true;
      }
    }
    // Also check for the repost icon being highlighted (green)
    const repostBtn = card.locator('[data-testid="unretweet"]');
    const repostCount = await withTimeout(repostBtn.count(), 1000, 0);
    return repostCount > 0;
  } catch {
    return false;
  }
}

async function isYours(page, card) {
  // Check if tweet author is the user
  const authorLink = await withTimeout(card.locator(`a[href="/${PROFILE_HANDLE}"]`).count(), 1500, 0);
  if (authorLink > 0) return true;

  const userNameLink = await withTimeout(card.locator(`[data-testid="User-Name"] a[href="/${PROFILE_HANDLE}"]`).count(), 1500, 0);
  if (userNameLink > 0) return true;

  // Check if this is a repost by the user (for undoing reposts)
  if (HANDLE_REPOSTS && await isUserRepost(card)) return true;

  // Last resort: check if menu has Delete option
  if (await menuHasDelete(page, card)) return true;
  return false;
}

// Scroll down to load more tweets
async function scrollToLoadTweets(page, passes = 5) {
  // Faster scrolling for deep passes, slower for shallow (to let content load)
  const delay = passes > 50 ? 300 : passes > 20 ? 400 : 500;

  for (let i = 0; i < passes; i++) {
    if (i % 50 === 0 && i > 0) {
      // Brief pause every 50 scrolls to let Twitter catch up
      await page.waitForTimeout(1000);
    }
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(delay);
  }
}

// Scroll to top of page
async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function statusKey(card) {
  const h = await withTimeout(
    card.locator('a[href*="/status/"]').first().getAttribute("href").catch(() => null),
    2000, null
  );
  if (!h) return null;
  try { return new URL(h, "https://x.com").pathname; } catch { return h; }
}

async function openMenu(page, card) {
  const more = card.locator([
    'button[data-testid="caret"]',
    'button[aria-haspopup="menu"][role="button"]',
    'div[data-testid="caret"]',
    'div[aria-haspopup="menu"][role="button"]'
  ].join(", "));
  if (!(await more.count())) return false;
  await more.first().click({ delay: 10, timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(150);
  return true;
}

async function menuHasDelete(page, card) {
  if (!(await openMenu(page, card))) return false;
  const items = page.locator('div[role="menuitem"], a[role="menuitem"], button[role="menuitem"]');
  const n = await withTimeout(items.count(), 2000, 0);
  let has = false;
  for (let i = 0; i < n && i < 10; i++) { // Limit loop iterations
    const t = ((await withTimeout(items.nth(i).innerText().catch(() => ""), 1000, "")) || "").trim();
    if (RE_DELETE.test(t)) { has = true; break; }
  }
  await page.keyboard.press("Escape").catch(() => {});
  return has;
}

async function clickMenuItem(page, regex) {
  const items = page.locator('div[role="menuitem"], a[role="menuitem"], button[role="menuitem"]');
  const n = await withTimeout(items.count(), 2000, 0);
  for (let i = 0; i < n && i < 10; i++) { // Limit iterations
    const t = ((await withTimeout(items.nth(i).innerText().catch(() => ""), 1000, "")) || "").trim();
    if (regex.test(t)) {
      await items.nth(i).click({ delay: 10, timeout: 5000 }).catch(() => {});
      return true;
    }
  }
  return false;
}

async function confirmDeleteIfNeeded(page) {
  const btn = page.locator([
    'div[data-testid="confirmationSheetConfirm"]',
    'button[data-testid="confirmationSheetConfirm"]',
    'button:has-text("Delete")',
    'div[role="button"]:has-text("Delete")'
  ].join(", ")).first();
  const count = await withTimeout(btn.count(), 2000, 0);
  if (count > 0) await btn.click({ delay: 10, timeout: 5000 }).catch(() => {});
}

async function tryDelete(page, card) {
  if (!(await openMenu(page, card))) return { ok: false, reason: "no-menu" };

  // Try to find and click Delete
  const items = page.locator('div[role="menuitem"], a[role="menuitem"], button[role="menuitem"]');
  const n = await withTimeout(items.count(), 2000, 0);

  if (n === 0) {
    await page.keyboard.press("Escape").catch(() => {});
    return { ok: false, reason: "menu-empty" };
  }

  // Look for Delete option
  for (let i = 0; i < n && i < 10; i++) {
    const t = ((await withTimeout(items.nth(i).innerText().catch(() => ""), 1000, "")) || "").trim();
    if (RE_DELETE.test(t)) {
      await items.nth(i).click({ delay: 10, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(150);
      await confirmDeleteIfNeeded(page);
      return { ok: true, reason: "deleted" };
    }
  }

  // Delete not found - log what WAS in the menu for debugging
  const menuItems = [];
  for (let i = 0; i < Math.min(n, 5); i++) {
    const t = ((await withTimeout(items.nth(i).innerText().catch(() => ""), 500, "")) || "").trim();
    if (t) menuItems.push(t.split('\n')[0]); // First line only
  }
  await page.keyboard.press("Escape").catch(() => {});
  console.log(`[DEBUG] Menu had ${n} items: ${menuItems.join(', ')}`);

  return { ok: false, reason: "no-delete-item" };
}

async function tryUndoRepost(page, card) {
  if (!HANDLE_REPOSTS) return { ok: false, reason: "repost-disabled" };

  // Find the repost/unretweet button - green when active
  const unretweetBtn = card.locator('[data-testid="unretweet"]').first();
  const retweetBtn = card.locator('[data-testid="retweet"]').first();

  // Check for the unretweet button (indicates this is a repost)
  const unretweetCount = await withTimeout(unretweetBtn.count(), 2000, 0);

  if (unretweetCount > 0) {
    // Found unretweet button - click it to undo
    log("info", "Found unretweet button, attempting undo...");
    await unretweetBtn.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);

    // Click "Undo Repost" from the popup menu
    const ok = await clickMenuItem(page, RE_UNDO_REPOST);
    if (!ok) {
      await page.keyboard.press("Escape").catch(() => {});
      return { ok: false, reason: "no-undo-item" };
    }
    return { ok: true, reason: "unreposted" };
  }

  // Check if there's a regular retweet button (not reposted)
  const retweetCount = await withTimeout(retweetBtn.count(), 2000, 0);
  if (retweetCount > 0) {
    // Has retweet button but NOT unretweet - this isn't our repost
    return { ok: false, reason: "not-a-repost" };
  }

  // Neither button found - might be a different tweet type
  return { ok: false, reason: "no-repost-btn" };
}

async function collectWorklist(page, want, seen) {
  const cards = allCards(page);
  const n = await cards.count();
  const mine = [];
  for (let i = 0; i < n && mine.length < want; i++) {
    const card = cards.nth(i);
    const key = await statusKey(card);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    // Check date FIRST to avoid opening menus on protected tweets
    if (!(await shouldDeleteByDate(card))) {
      continue; // Skip - either protected, too new, or unknown date
    }

    // Only check ownership (which may open menu) for tweets we want to delete
    if (await isYours(page, card)) {
      mine.push(card);
    }
  }
  return mine;
}

// ================= MAIN PROCESSING =================
async function processTab(page, tabName, removed, startTime) {
  console.log("");
  log("tab", chalk.magenta.bold(`Processing ${tabName}`));
  log("info", `DELETE from ${formatDate(DELETE_BEFORE)} to ${formatDate(PROTECT_AFTER)}, PROTECT after ${formatDate(PROTECT_AFTER)}`);

  await gotoProfileTab(page, tabName);

  let lastProgressTime = Date.now();
  let sweepCount = 0;
  const MAX_SWEEPS = 50;  // Max full sweeps before giving up

  // Outer loop: Full sweeps from top to bottom
  while (removed.count < TARGET && !isAborted() && sweepCount < MAX_SWEEPS) {
    sweepCount++;
    let deletedThisSweep = 0;
    let noLoadCount = 0;
    const seen = new Set();  // Fresh seen set each sweep

    // Go to top for each sweep
    log("info", `Starting sweep ${sweepCount}...`);
    await scrollToTop(page);
    await page.waitForTimeout(1000);

    // Inner loop: Scroll down page by page, deleting as we go
    while (removed.count < TARGET && !isAborted() && noLoadCount < 10) {
      // Periodic status update
      if (Date.now() - lastProgressTime > 2 * 60 * 1000) {
        log("info", `Still running... ${removed.count}/${TARGET} deleted (sweep ${sweepCount})`);
        lastProgressTime = Date.now();
      }

      // Find deletable tweets in current view
      const work = await collectWorklist(page, Math.min(10, TARGET - removed.count), seen);

      // Debug: show what we found
      const totalCards = await allCards(page).count();
      log("info", `Found ${work.length} deletable of ${totalCards} total cards (${seen.size} scanned)`);

      // Pause videos and dismiss popups to prevent blocking
      await pauseAllVideos(page);
      await dismissPopups(page);

      if (work.length > 0) {
        noLoadCount = 0;

        // Delete each tweet found
        for (const card of work) {
          if (isAborted() || removed.count >= TARGET) break;

          try {
            // Timeout scroll to prevent hanging on video tweets
            await Promise.race([
              card.scrollIntoViewIfNeeded(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('scroll timeout')), 3000))
            ]).catch(() => {});
            await page.waitForTimeout(100);

            let deleteRes = await tryDelete(page, card);
            let res = deleteRes;

            if (!deleteRes.ok) {
              // Try repost undo as fallback
              res = await tryUndoRepost(page, card);
            }

            // Log if tweet couldn't be deleted - show both reasons
            if (!res.ok) {
              if (deleteRes.reason !== res.reason) {
                log("warn", `Skipped: delete failed (${deleteRes.reason}), repost failed (${res.reason})`);
              } else {
                log("info", `Skipped: ${res.reason}`);
              }
            }

            if (res.ok) {
              removed.count++;
              deletedThisSweep++;
              updateProgress(removed.count, tabName, TARGET);
              lastProgressTime = Date.now();
            }
          } catch (e) {
            log("error", "Delete failed (continuing)", e?.message || e);
          }

          await pause(MIN_DELAY_MS, MAX_DELAY_MS);
        }

        // Rate limit protection
        if (removed.count % 100 === 0 && removed.count > 0) {
          log("info", `${removed.count} deleted. Brief pause...`);
          await page.waitForTimeout(3000);
        }
      }

      // Scroll down to load more tweets - use multiple methods for reliability
      const beforeCount = await allCards(page).count();

      // Method 1: Scroll via keyboard (most reliable for infinite scroll)
      await page.keyboard.press('End');
      await page.waitForTimeout(500);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(500);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(1000);

      const afterCount = await allCards(page).count();
      console.log(`[SCROLL] ${beforeCount} → ${afterCount} cards loaded`);

      // Pause videos and dismiss any popups that appeared
      await pauseAllVideos(page);
      await dismissPopups(page);

      // Check if we hit the bottom (no new tweets loading)
      if (afterCount <= beforeCount) {
        noLoadCount++;
        console.log(`[SCROLL] No new content (attempt ${noLoadCount}/10)`);
      } else {
        noLoadCount = 0;
      }
    }

    log("info", `Sweep ${sweepCount} complete: ${deletedThisSweep} deleted this sweep`);

    // If no deletions this sweep, we might be done
    if (deletedThisSweep === 0) {
      // Try refreshing page once to see if more tweets appear
      if (sweepCount % 3 === 0) {
        log("info", "No deletions - refreshing page to check for more...");
        await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
      } else {
        // Two consecutive empty sweeps = probably done
        log("info", "No more deletable tweets found. Done with tab.");
        break;
      }
    }
  }
}

async function run() {
  const startTime = Date.now();

  printHeader();
  printConfig({
    handle: PROFILE_HANDLE,
    target: TARGET,
    deleteMonth: DELETE_MONTH,
    deleteYear: DELETE_YEAR,
    protectMonth: PROTECT_MONTH,
    protectYear: PROTECT_YEAR,
    posts: INCLUDE_POSTS,
    replies: INCLUDE_REPLIES,
    reposts: HANDLE_REPOSTS,
    speed: SPEED
  });

  const launchSpinner = ora({
    text: chalk.cyan('Launching browser...'),
    spinner: 'dots12'
  }).start();

  let context, browser, page;

  // Browser args to prevent throttling when window loses focus
  const browserArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--disable-automation",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--autoplay-policy=user-gesture-required",  // Prevent video autoplay causing hangs
    "--test-type",  // Suppress "unsupported command-line flag" warnings
    "--no-sandbox"  // Required for some environments
  ];

  // Private mode: always use fresh browser (no Edge profile)
  if (PRIVATE_MODE) {
    log("info", "Using private browser mode (fresh session)");
    browser = await chromium.launch({
      headless: HEADLESS,
      channel: 'msedge',
      args: browserArgs,
      ignoreDefaultArgs: ["--enable-automation"]
    });
    // Use handle-specific storage if it exists and is valid
    const handleStorage = getStoragePath(PROFILE_HANDLE);
    const useStorage = isSessionValid(PROFILE_HANDLE) ? handleStorage : undefined;

    context = await browser.newContext({
      storageState: useStorage
    });
    page = await context.newPage();
  } else {
    // Try to use Edge profile (has extensions like 1Password)
    const userDataDir = process.env.EDGE_USER_DATA || path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data');
    const profileDir = process.env.EDGE_PROFILE || 'Default';

    try {
      context = await chromium.launchPersistentContext(
        path.join(userDataDir, profileDir),
        {
          headless: HEADLESS,
          channel: 'msedge',
          args: [
            ...browserArgs,
            "--no-first-run",
            "--no-default-browser-check",
            "--enable-extensions",
            "--disable-component-extensions-with-background-pages=false"
          ],
          ignoreDefaultArgs: ["--disable-extensions", "--enable-automation"]
        }
      );
      page = context.pages()[0] || await context.newPage();
      log("success", "Using your Edge profile with extensions");
    } catch (err) {
      // Fallback: Edge might be open, use fresh profile instead
      log("warn", "Edge may be open. Using fresh browser (close Edge for full access)");
      browser = await chromium.launch({
        headless: HEADLESS,
        channel: 'msedge',
        args: browserArgs,
        ignoreDefaultArgs: ["--enable-automation"]
      });
      const handleStorage = getStoragePath(PROFILE_HANDLE);
      const useStorage = isSessionValid(PROFILE_HANDLE) ? handleStorage : undefined;

      context = await browser.newContext({
        storageState: useStorage
      });
      page = await context.newPage();
    }
  }

  launchSpinner.succeed(chalk.green('Browser ready'));

  const loggedIn = await ensureLoggedIn(page, context);
  if (!loggedIn) {
    log("error", "Login required! Cannot proceed without authentication.");
    if (browser) await browser.close();
    else await context.close();
    throw new Error("Login required - please log in to X/Twitter first");
  }

  const tabs = [];
  // Process Replies FIRST - old tweets are usually on /with_replies page
  if (INCLUDE_REPLIES) tabs.push("Replies");
  if (INCLUDE_POSTS) tabs.push("Posts");

  if (tabs.length === 0) {
    log("warn", chalk.yellow("Nothing to do - both Posts and Replies are disabled"));
    if (browser) await browser.close();
    else await context.close();
    return;
  }

  const removed = { count: 0 };

  // Create progress bar
  console.log("");
  createProgressBar(TARGET);

  for (const tab of tabs) {
    if (removed.count >= TARGET) break;
    await processTab(page, tab, removed, startTime);
  }

  stopProgress();

  // Save session for this specific handle
  try { await context.storageState({ path: getStoragePath(PROFILE_HANDLE) }); } catch {}
  if (browser) await browser.close();
  else await context.close();

  printSummary(removed.count, TARGET, startTime);

  if (removed.count >= TARGET) {
    console.log(chalk.green.bold('  🎉 Target reached! All done.\n'));
  } else {
    console.log(chalk.cyan('  ℹ Finished - no more matching tweets found\n'));
  }

  // Return actual deleted count for programmatic use
  return removed.count;
}

// Wait for keypress before exiting
async function waitForExit(message = 'Press Enter to exit...') {
  if (!IS_CLI) return;
  console.log(chalk.gray(`  ${message}`));
  process.stdin.resume();
  await new Promise(res => process.stdin.once('data', res));
}

/**
 * Run cleanup with config object (for Electron/programmatic use)
 * @param {Object} config - Configuration object
 * @param {string} config.handle - X/Twitter handle (without @)
 * @param {number} config.target - Maximum tweets to delete
 * @param {number} config.deleteMonth - Delete tweets before this month (1-12)
 * @param {number} config.deleteYear - Delete tweets before this year
 * @param {number} config.protectMonth - Protect tweets after this month (1-12)
 * @param {number} config.protectYear - Protect tweets after this year
 * @param {boolean} config.posts - Include regular posts
 * @param {boolean} config.replies - Include replies
 * @param {boolean} config.reposts - Include reposts/retweets
 * @param {string} config.speed - Speed preset: 'aggressive', 'normal', 'conservative'
 * @param {boolean} config.headless - Run browser in headless mode
 * @param {Object} callbacks - Callback functions
 * @param {Function} callbacks.onProgress - Progress callback: ({current, total, tab}) => void
 * @param {Function} callbacks.onLog - Log callback: ({type, message}) => void
 * @param {Function} callbacks.onComplete - Complete callback: ({deleted, target, elapsed}) => void
 */
async function runCleanup(config, callbacks = {}) {
  // Set callbacks
  onProgressCallback = callbacks.onProgress || null;
  onLogCallback = callbacks.onLog || null;

  // Set config variables from passed config
  PROFILE_HANDLE = config.handle;
  TARGET = config.target || 10000;
  DELETE_MONTH = config.deleteMonth || 12;
  DELETE_YEAR = config.deleteYear || 2014;
  PROTECT_MONTH = config.protectMonth || 1;
  PROTECT_YEAR = config.protectYear || 2025;
  INCLUDE_POSTS = config.posts !== false;
  INCLUDE_REPLIES = config.replies !== false;
  HANDLE_REPOSTS = config.reposts === true;
  SPEED = config.speed || 'normal';
  HEADLESS = config.headless === true; // Only headless if explicitly set - default to showing browser for login
  PRIVATE_MODE = config.privateMode === true; // Use fresh browser instead of Edge profile

  // Set delays based on speed
  const delays = SPEED_PRESETS[SPEED] || SPEED_PRESETS.normal;
  MIN_DELAY_MS = delays.min;
  MAX_DELAY_MS = delays.max;

  // Set date boundaries
  DELETE_BEFORE = new Date(DELETE_YEAR, DELETE_MONTH - 1, 1);
  PROTECT_AFTER = new Date(PROTECT_YEAR, PROTECT_MONTH - 1, 1);

  // Create fresh abort controller for this run
  abortController = new AbortController();

  // Run the cleanup
  const startTime = Date.now();
  let deletedCount = 0;

  try {
    deletedCount = await run() || 0;  // Get actual deleted count from run()
  } catch (err) {
    if (!isAborted()) {
      // Only report error if not aborted
      if (callbacks.onLog) {
        callbacks.onLog({ type: 'error', message: err?.message || String(err) });
      }
      throw err;
    }
  }

  if (isAborted()) {
    if (callbacks.onLog) {
      callbacks.onLog({ type: 'info', message: 'Cleanup stopped by user' });
    }
  }

  if (callbacks.onComplete) {
    callbacks.onComplete({
      deleted: deletedCount,
      target: TARGET,
      elapsed: ((Date.now() - startTime) / 1000).toFixed(1)
    });
  }
}

// Export for programmatic use
module.exports = { run, runCleanup, abortCleanup };

// Run if called directly (CLI mode)
if (require.main === module) {
  // Parse config from environment/command line
  parseEnvConfig();

  run()
    .then(async () => {
      await waitForExit();
    })
    .catch(async (err) => {
    console.log("");
    const errorBox = boxen(
      chalk.red.bold('FATAL ERROR\n\n') +
      chalk.white(err?.message || err) + '\n\n' +
      chalk.gray(err?.stack || ''),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'red'
      }
    );
    console.log(errorBox);
    await waitForExit('Press Enter to exit...');
    process.exit(1);
  });
}
