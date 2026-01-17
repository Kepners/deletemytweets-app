#!/usr/bin/env node
// deletemytweets — Date-filtered tweet deletion tool for X (Twitter)
// Safely delete old tweets while protecting recent ones
// https://github.com/Kepners/deletemytweets

const fs = require("fs");
const path = require("path");
const { chromium, firefox } = require("playwright");

// ================= ANTI-DETECTION CONFIG =================
// Random user agents (real Firefox on Windows)
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
];

// Random viewport sizes (common desktop resolutions)
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 800 },
  { width: 1280, height: 720 },
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getRandomViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

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
let USE_FIREFOX = true;    // Use Firefox instead of Edge (better anti-detection)
let PROXY_SERVER = null;   // Optional proxy: "host:port" or "http://user:pass@host:port"
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
  PROFILE_HANDLE = process.env.PROFILE_HANDLE || process.argv[2] || savedConfig.handle;

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

  INCLUDE_POSTS = (process.env.INCLUDE_POSTS ?? "true") === "true";
  INCLUDE_REPLIES = (process.env.INCLUDE_REPLIES ?? "true") === "true";
  HANDLE_REPOSTS = (process.env.HANDLE_REPOSTS ?? "false") === "true";

  TARGET = parseInt(process.env.TARGET ?? "200", 10);
  HEADLESS = (process.env.HEADLESS ?? "false") === "true";
  SPEED = process.env.SPEED ?? "normal";

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

  DELETE_MONTH = parseInt(process.env.DELETE_MONTH ?? "12", 10);
  DELETE_YEAR = parseInt(process.env.DELETE_YEAR ?? process.env.DELETE_YEAR_AND_OLDER ?? "2014", 10);
  PROTECT_MONTH = parseInt(process.env.PROTECT_MONTH ?? "01", 10);
  PROTECT_YEAR = parseInt(process.env.PROTECT_YEAR ?? process.env.PROTECT_YEAR_AND_NEWER ?? "2025", 10);

  DELETE_BEFORE = new Date(DELETE_YEAR, DELETE_MONTH - 1, 1);
  PROTECT_AFTER = new Date(PROTECT_YEAR, PROTECT_MONTH - 1, 1);
}


const RE_DELETE = /(Delete|Eliminar|Supprimer|Löschen|Elimina|Excluir|Удалить|削除|삭제|刪除)/i;
const RE_UNDO_REPOST = /(Undo\s+(Repost|Retweet)|Unretweet|Deshacer\s+Repost|Annuler\s+Retweet|zurücknehmen|Desfazer|Отменить|취소|转推)/i;

// ================= UTILITIES =================
function rand(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); }
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function pause(minMs, maxMs) { await sleep(rand(minMs, maxMs)); }

// Weighted random - pick from array with weights
function weightedRandom(options) {
  const total = options.reduce((sum, opt) => sum + opt.weight, 0);
  let r = Math.random() * total;
  for (const opt of options) {
    r -= opt.weight;
    if (r <= 0) return opt.value;
  }
  return options[options.length - 1].value;
}

// ================= HUMAN BEHAVIOR SIMULATION =================
// This module makes the bot behave like a real, distracted human

// Mood affects behavior patterns - changes throughout session
let humanMood = 'normal'; // 'focused', 'normal', 'distracted', 'impatient'
let actionsSinceBreak = 0;
let deletionStreak = 0;

// Change mood randomly
function updateMood() {
  const roll = Math.random();
  if (roll < 0.1) humanMood = 'focused';      // 10% - fast, efficient
  else if (roll < 0.3) humanMood = 'impatient'; // 20% - quick but sloppy
  else if (roll < 0.5) humanMood = 'distracted'; // 20% - slow, pauses
  else humanMood = 'normal';                   // 50% - average
  log("info", `[Human] Mood: ${humanMood}`);
}

// Get delay multiplier based on mood
function getMoodMultiplier() {
  switch (humanMood) {
    case 'focused': return 0.7;
    case 'impatient': return 0.5;
    case 'distracted': return 1.8;
    default: return 1.0;
  }
}

// Human-like scroll - varies distance and speed
async function humanScroll(page, direction = 'down') {
  const scrollType = weightedRandom([
    { value: 'tiny', weight: 15 },      // Small adjustment
    { value: 'small', weight: 30 },     // Normal read scroll
    { value: 'medium', weight: 25 },    // Skim scroll
    { value: 'large', weight: 20 },     // Fast scroll
    { value: 'huge', weight: 10 },      // Jump scroll (like Page Down)
  ]);

  const vh = await page.evaluate(() => window.innerHeight);
  let distance;

  switch (scrollType) {
    case 'tiny': distance = rand(50, 150); break;
    case 'small': distance = rand(150, 300); break;
    case 'medium': distance = rand(300, vh * 0.6); break;
    case 'large': distance = rand(vh * 0.6, vh * 0.9); break;
    case 'huge': distance = rand(vh * 0.9, vh * 1.5); break;
  }

  if (direction === 'up') distance = -distance;

  // Sometimes use wheel, sometimes scrollBy, sometimes keyboard
  const method = weightedRandom([
    { value: 'scroll', weight: 50 },
    { value: 'wheel', weight: 35 },
    { value: 'key', weight: 15 },
  ]);

  if (method === 'wheel') {
    // Wheel scroll in chunks (like real mouse wheel)
    const chunks = rand(3, 8);
    const chunkSize = Math.floor(distance / chunks);
    for (let i = 0; i < chunks; i++) {
      await page.mouse.wheel(0, chunkSize);
      await sleep(rand(30, 80)); // Small delay between wheel ticks
    }
  } else if (method === 'key' && Math.abs(distance) > vh * 0.5) {
    // Use keyboard for big scrolls
    const key = direction === 'down' ? 'PageDown' : 'PageUp';
    await page.keyboard.press(key);
  } else {
    // Standard scrollBy
    await page.evaluate(d => window.scrollBy({ top: d, behavior: 'smooth' }), distance);
  }

  // Varied wait after scroll based on scroll size and mood
  const baseWait = scrollType === 'tiny' ? rand(100, 200) :
                   scrollType === 'small' ? rand(200, 400) :
                   scrollType === 'medium' ? rand(400, 800) :
                   scrollType === 'large' ? rand(600, 1200) :
                   rand(800, 1500);

  await sleep(Math.floor(baseWait * getMoodMultiplier()));
}

// Occasionally scroll back up (overshoot correction)
async function maybeOvershootCorrect(page) {
  if (Math.random() < 0.12) { // 12% chance
    log("info", "[Human] Oops, scrolled too far...");
    await humanScroll(page, 'up');
    await sleep(rand(300, 700));
  }
}

// Random "reading" pause - like stopping to read a tweet
async function maybeReadPause(page) {
  const roll = Math.random();
  if (roll < 0.08) { // 8% chance of long read
    const duration = rand(2000, 5000);
    log("info", `[Human] Reading something interesting... (${Math.round(duration/1000)}s)`);
    await sleep(duration);
  } else if (roll < 0.25) { // 17% chance of short glance
    await sleep(rand(500, 1500));
  }
}

// Random distraction - check profile, notifications, etc.
async function maybeGetDistracted(page) {
  if (Math.random() < 0.03) { // 3% chance
    const distraction = weightedRandom([
      { value: 'profile', weight: 40 },
      { value: 'scroll_up', weight: 30 },
      { value: 'long_pause', weight: 30 },
    ]);

    if (distraction === 'profile') {
      log("info", "[Human] Checking profile...");
      await page.click(`a[href="/${PROFILE_HANDLE}"]`).catch(() => {});
      await sleep(rand(1500, 3500));
      await page.goBack().catch(() => {});
      await sleep(rand(800, 1500));
    } else if (distraction === 'scroll_up') {
      log("info", "[Human] Scrolling back to check something...");
      for (let i = 0; i < rand(2, 5); i++) {
        await humanScroll(page, 'up');
      }
      await sleep(rand(1000, 2500));
      // Scroll back down
      for (let i = 0; i < rand(3, 6); i++) {
        await humanScroll(page, 'down');
      }
    } else {
      const pauseDuration = rand(3000, 8000);
      log("info", `[Human] Got distracted... (${Math.round(pauseDuration/1000)}s)`);
      await sleep(pauseDuration);
    }
  }
}

// Simulate misclick - open menu then close without action
async function maybeMisclick(page, card) {
  if (Math.random() < 0.04) { // 4% chance
    log("info", "[Human] Misclick - closing menu...");
    await openMenu(page, card);
    await sleep(rand(200, 500));
    await page.keyboard.press('Escape');
    await sleep(rand(500, 1000));
    return true;
  }
  return false;
}

// Human-like deletion delay - bursty with occasional slow downs
function getHumanDeleteDelay() {
  deletionStreak++;

  // After several quick deletions, slow down
  if (deletionStreak > rand(5, 12)) {
    deletionStreak = 0;
    return rand(2500, 5000) * getMoodMultiplier(); // Long pause
  }

  // Burst mode - quick deletions
  if (humanMood === 'impatient' || humanMood === 'focused') {
    return rand(600, 1200) * getMoodMultiplier();
  }

  // Normal varied delay
  const delay = weightedRandom([
    { value: rand(800, 1200), weight: 30 },   // Quick
    { value: rand(1200, 2000), weight: 40 },  // Normal
    { value: rand(2000, 3500), weight: 20 },  // Slow
    { value: rand(3500, 6000), weight: 10 },  // Very slow (distracted)
  ]);

  return Math.floor(delay * getMoodMultiplier());
}

// Take a break - happens periodically
async function maybeTakeBreak(page) {
  actionsSinceBreak++;

  // Change mood occasionally
  if (actionsSinceBreak % rand(15, 30) === 0) {
    updateMood();
  }

  // Take break every 30-80 actions
  if (actionsSinceBreak > rand(30, 80)) {
    actionsSinceBreak = 0;
    const breakDuration = rand(5000, 15000);
    log("info", `[Human] Taking a break... (${Math.round(breakDuration/1000)}s)`);

    // Maybe scroll around during break
    if (Math.random() < 0.4) {
      for (let i = 0; i < rand(2, 5); i++) {
        await humanScroll(page, Math.random() < 0.3 ? 'up' : 'down');
      }
    }

    await sleep(breakDuration);
    updateMood();
  }
}

// ================= AUTH =================
async function isLoggedIn(context) {
  try { return (await context.cookies()).some(c => c.name.toLowerCase() === "auth_token"); }
  catch { return false; }
}

// Verify the logged-in account matches the expected handle
async function verifyAccount(page, expectedHandle) {
  try {
    // Check if we're on the right profile by looking at the URL or page content
    log("info", `Navigating to profile @${expectedHandle}...`);
    await page.goto(`https://x.com/${expectedHandle}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000); // Give page time to fully load

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

    // Strategy 3: Check URL matches expected handle (case-insensitive)
    const currentUrl = page.url().toLowerCase();
    if (currentUrl.includes(`x.com/${expectedHandle.toLowerCase()}`)) {
      // We're on the right profile page and no Follow button = likely our profile
      log("info", `On correct profile URL, assuming it's ours`);
      return true;
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
      // Logged in but wrong account - clear cookies and force re-login
      log("warn", chalk.yellow(`Logged in as wrong account! Need @${PROFILE_HANDLE}`));
      log("info", "Clearing session and opening login page...");
      clearSession(PROFILE_HANDLE);

      // Clear all cookies to force fresh login
      await context.clearCookies();

      // Navigate to logout then login
      await page.goto('https://x.com/logout', { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1000);
      // Click logout confirm if present
      const logoutBtn = page.locator('[data-testid="confirmationSheetConfirm"]');
      if (await logoutBtn.count() > 0) {
        await logoutBtn.click().catch(() => {});
        await page.waitForTimeout(2000);
      }
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
    if (await timeEl.count() === 0) {
      const statusLink = card.locator('a[href*="/status/"] time[datetime]').first();
      if (await statusLink.count() === 0) return null;
      const datetime = await statusLink.getAttribute('datetime');
      if (!datetime) return null;
      const date = new Date(datetime);
      if (isNaN(date.getTime())) return null;
      return date;
    }

    const datetime = await timeEl.getAttribute('datetime');
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
    const tweetText = await card.locator('[data-testid="tweetText"]').first().innerText().catch(() => "");
    preview = tweetText.substring(0, 40).replace(/\n/g, " ");
    if (tweetText.length > 40) preview += "...";
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

  // Delete tweets before the delete date
  if (tweetDate < DELETE_BEFORE) {
    log("delete", chalk.red(`${dateStr} → DELETE`), chalk.gray(`"${preview}"`));
    return true;
  }

  log("skip", chalk.gray(`${dateStr} Outside range`), chalk.gray(`"${preview}"`));
  return false;
}

// ================= TWEET OPERATIONS =================
async function isYours(page, card) {
  if (await card.locator(`a[href="/${PROFILE_HANDLE}"]`).count()) return true;
  if (await card.locator(`[data-testid="User-Name"] a[href="/${PROFILE_HANDLE}"]`).count()) return true;
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
  const h = await card.locator('a[href*="/status/"]').first().getAttribute("href").catch(() => null);
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
  await more.first().click({ delay: 10 }).catch(() => {});
  await page.waitForTimeout(150);
  return true;
}

async function menuHasDelete(page, card) {
  if (!(await openMenu(page, card))) return false;
  const items = page.locator('div[role="menuitem"], a[role="menuitem"], button[role="menuitem"]');
  const n = await items.count();
  let has = false;
  for (let i = 0; i < n; i++) {
    const t = ((await items.nth(i).innerText().catch(() => "")) || "").trim();
    if (RE_DELETE.test(t)) { has = true; break; }
  }
  await page.keyboard.press("Escape").catch(() => {});
  return has;
}

async function clickMenuItem(page, regex) {
  const items = page.locator('div[role="menuitem"], a[role="menuitem"], button[role="menuitem"]');
  const n = await items.count();
  for (let i = 0; i < n; i++) {
    const t = ((await items.nth(i).innerText().catch(() => "")) || "").trim();
    if (regex.test(t)) { await items.nth(i).click({ delay: 10 }).catch(() => {}); return true; }
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
  if (await btn.count()) await btn.click({ delay: 10 }).catch(() => {});
}

async function tryDelete(page, card) {
  if (!(await openMenu(page, card))) return { ok: false, reason: "no-menu" };
  const ok = await clickMenuItem(page, RE_DELETE);
  if (!ok) return { ok: false, reason: "no-delete-item" };
  await page.waitForTimeout(150);
  await confirmDeleteIfNeeded(page);
  return { ok: true, reason: "deleted" };
}

async function tryUndoRepost(page, card) {
  if (!HANDLE_REPOSTS) return { ok: false, reason: "repost-disabled" };
  if (!(await openMenu(page, card))) return { ok: false, reason: "no-menu" };
  const ok = await clickMenuItem(page, RE_UNDO_REPOST);
  return ok ? { ok: true, reason: "unreposted" } : { ok: false, reason: "no-undo-item" };
}

async function collectWorklist(page, want, seen) {
  const cards = allCards(page);
  const n = await cards.count();

  // Debug: log how many cards visible
  if (n === 0) {
    log("warn", "No tweet cards found on page!");
  }

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
// Human-like behavior: varied scrolling, random pauses, misclicks, mood changes

// Human-like scroll to load more tweets
async function autoScroll(page, wantMore = 15) {
  const MAX_PASSES = 25;

  let prevCount = await allCards(page).count();
  let lastH = await page.evaluate(() => document.documentElement.scrollHeight);
  let stale = 0;

  // Initialize mood at start of scroll session
  if (Math.random() < 0.2) updateMood();

  for (let pass = 0; pass < MAX_PASSES && !isAborted(); pass++) {
    // Vary number of scrolls per pass (humans don't scroll exactly 10 times)
    const scrollsThisPass = rand(4, 12);

    for (let i = 0; i < scrollsThisPass && !isAborted(); i++) {
      await humanScroll(page, 'down');

      // Human behaviors during scrolling
      await maybeReadPause(page);
      await maybeOvershootCorrect(page);

      // Occasionally get distracted
      if (i === Math.floor(scrollsThisPass / 2)) {
        await maybeGetDistracted(page);
      }
    }

    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    stale = (h === lastH) ? stale + 1 : 0;
    lastH = h;

    const now = await allCards(page).count();
    if (now - prevCount >= wantMore) break;
    prevCount = now;

    // More patience when stale (like a human trying again)
    if (stale >= 2 && stale < 5) {
      log("info", "[Human] Hmm, nothing new... trying again");
      await sleep(rand(1000, 2500));
    }
    if (stale >= 5) break;
  }
}

async function processTab(page, tabName, removed, startTime) {
  console.log("");
  log("tab", chalk.magenta.bold(`Processing ${tabName}`));
  log("info", `DELETE before ${formatDate(DELETE_BEFORE)}, PROTECT after ${formatDate(PROTECT_AFTER)}`);

  // Initialize human state for this tab
  updateMood();
  actionsSinceBreak = 0;
  deletionStreak = 0;

  await gotoProfileTab(page, tabName);

  // Initial human-like scroll (not exactly 18, vary it)
  await autoScroll(page, rand(12, 22));

  const seen = new Set();
  let noMatchPasses = 0;
  const MAX_NO_MATCH_PASSES = 20; // More patient

  while (removed.count < TARGET && !isAborted()) {
    // Vary batch size (humans don't always grab exactly 10)
    const need = Math.min(rand(5, 15), TARGET - removed.count);
    let work = await collectWorklist(page, need, seen);

    if (!work.length) {
      // No deletable tweets found - scroll more
      const before = await allCards(page).count();
      await autoScroll(page, rand(8, 16));
      const after = await allCards(page).count();

      if (after <= before) {
        noMatchPasses++;
        log("info", `No new tweets loaded (${noMatchPasses}/${MAX_NO_MATCH_PASSES})`);

        // Human frustration behavior
        if (noMatchPasses === 5) {
          log("info", "[Human] Getting frustrated, trying a big scroll...");
          for (let i = 0; i < rand(3, 6); i++) {
            await page.keyboard.press('PageDown');
            await sleep(rand(200, 500));
          }
          await sleep(rand(1000, 2000));
        }

        if (noMatchPasses >= MAX_NO_MATCH_PASSES) {
          log("info", `No more matching tweets on ${tabName}`);
          break;
        }
      } else {
        noMatchPasses = 0;
      }
      continue;
    }

    noMatchPasses = 0;

    // Delete found tweets with human-like behavior
    for (const card of work) {
      if (isAborted() || removed.count >= TARGET) break;

      try {
        // Maybe misclick first
        await maybeMisclick(page, card);

        // Actual deletion attempt
        let res = await tryDelete(page, card);
        if (!res.ok) res = await tryUndoRepost(page, card);

        if (res.ok) {
          removed.count++;
          updateProgress(removed.count, tabName, TARGET);
        }
      } catch (e) {
        log("error", "Delete failed (continuing)", e?.message || e);
        // Human recovery from error - pause and maybe scroll
        await sleep(rand(500, 1500));
      }

      // Human-like delay between deletions
      await sleep(getHumanDeleteDelay());

      // Maybe take a break
      await maybeTakeBreak(page);
    }

    // Varied rate limit protection (not exactly every 100)
    const checkInterval = rand(80, 130);
    if (removed.count % checkInterval === 0 && removed.count > 0) {
      const pauseDuration = rand(8000, 20000);
      log("info", `${removed.count} deleted. Taking a longer break... (${Math.round(pauseDuration/1000)}s)`);
      await sleep(pauseDuration);
      updateMood();
    }

    // Scroll more to find more tweets (varied amount)
    if (removed.count < TARGET && !isAborted()) {
      await autoScroll(page, rand(6, 14));
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

  // Anti-detection setup
  const userAgent = getRandomUserAgent();
  const viewport = getRandomViewport();
  log("info", `Viewport: ${viewport.width}x${viewport.height}`);

  // Build context options with anti-detection features
  const contextOptions = {
    viewport,
    userAgent,
    // Realistic browser settings
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Prevent WebDriver detection
    bypassCSP: true,
  };

  // Add proxy if configured
  if (PROXY_SERVER) {
    log("info", `Using proxy: ${PROXY_SERVER.replace(/:[^:@]+@/, ':****@')}`);
    contextOptions.proxy = { server: PROXY_SERVER };
  }

  // Choose browser engine
  const browserEngine = USE_FIREFOX ? firefox : chromium;
  const browserName = USE_FIREFOX ? 'Firefox' : 'Edge';
  log("info", `Browser: ${browserName}`);

  // Browser args to prevent throttling (Chromium-specific, Firefox ignores these)
  const chromiumArgs = [
    "--disable-blink-features=AutomationControlled",
    "--disable-infobars",
    "--disable-automation",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling"
  ];

  // Private mode: always use fresh browser (no Edge profile)
  if (PRIVATE_MODE || USE_FIREFOX) {
    log("info", USE_FIREFOX ? "Using Firefox (fresh session)" : "Using private browser mode");
    const handleStorage = getStoragePath(PROFILE_HANDLE);
    const hasSession = isSessionValid(PROFILE_HANDLE);

    // MUST show browser if no saved session (user needs to login)
    const needsLogin = !hasSession;
    const actualHeadless = needsLogin ? false : HEADLESS;

    if (needsLogin) {
      log("info", "No saved session - browser will open for login");
    }

    // Firefox launch options
    const launchOptions = {
      headless: actualHeadless,
    };

    // Add Chromium-specific options only for Chromium
    if (!USE_FIREFOX) {
      launchOptions.channel = 'msedge';
      launchOptions.args = chromiumArgs;
      launchOptions.ignoreDefaultArgs = ["--enable-automation"];
    }

    browser = await browserEngine.launch(launchOptions);

    // Create context with anti-detection options
    context = await browser.newContext({
      ...contextOptions,
      storageState: hasSession ? handleStorage : undefined,
    });
    page = await context.newPage();
  } else {
    // Edge profile mode (non-Firefox, non-private)
    const userDataDir = process.env.EDGE_USER_DATA || path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Edge', 'User Data');
    const profileDir = process.env.EDGE_PROFILE || 'Default';

    try {
      context = await chromium.launchPersistentContext(
        path.join(userDataDir, profileDir),
        {
          headless: HEADLESS,
          channel: 'msedge',
          ...contextOptions,
          args: [
            ...chromiumArgs,
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
        args: chromiumArgs,
        ignoreDefaultArgs: ["--enable-automation"]
      });
      const handleStorage = getStoragePath(PROFILE_HANDLE);
      const useStorage = isSessionValid(PROFILE_HANDLE) ? handleStorage : undefined;

      context = await browser.newContext({
        ...contextOptions,
        storageState: useStorage,
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
  HEADLESS = config.headless === true;
  PRIVATE_MODE = config.privateMode === true;
  USE_FIREFOX = config.useFirefox !== false;  // Default to Firefox (better anti-detection)
  PROXY_SERVER = config.proxy || null;         // Optional: "host:port" or "http://user:pass@host:port"

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
