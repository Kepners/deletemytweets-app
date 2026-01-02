# Delete My Tweets

Date-filtered tweet deletion tool for X (Twitter). Safely delete old tweets while protecting recent ones.

Available as both a **Desktop GUI App** (Electron) and a **CLI tool**.

## Features

- **Desktop GUI App**: Modern dark-themed interface with custom titlebar
- **Date-based filtering**: Delete tweets before a specific month/year
- **Protection layer**: Never touches tweets after a specified date
- **Content type selection**: Choose to delete Posts, Replies, and/or Reposts
- **Multi-language support**: Works with X in English, Spanish, French, German, Portuguese, Russian, Japanese, Korean, and Chinese
- **Session persistence**: Saves login session for future runs (24-hour expiry)
- **Account verification**: Ensures you're logged into the correct account
- **Configurable targets**: Set how many tweets to delete per run

## Installation

### Desktop App (Recommended)

Download from the [Releases](https://github.com/Kepners/deletemytweets/releases) page:
- **Portable**: `Delete My Tweets 1.1.0.exe` - No installation needed, just run
- **Installer**: `Delete My Tweets Setup 1.1.0.exe` - Traditional Windows installer

### From Source

```bash
git clone https://github.com/Kepners/deletemytweets.git
cd deletemytweets
npm install
npx playwright install chromium
```

## Usage

### Desktop App

1. **Launch**: Double-click `START_APP.bat` or run `npm start`
2. **Set Handle**: Click on the profile section to enter your X handle
3. **Configure**:
   - Select content types (Posts, Replies, Reposts)
   - Set "Delete Before" date (month + year)
   - Set "Protect After" date (month + year)
   - Set target count
   - Toggle "Show browser window" for faster deletion + live view
4. **Start**: Click "Start Cleanup"
5. **Login**: If needed, log in to X in the browser window that opens

### CLI

```bash
# Delete up to 200 tweets from 2014 and older
node index.js yourusername

# Or with environment variables
PROFILE_HANDLE=yourusername node index.js

# With custom settings
PROFILE_HANDLE=yourusername TARGET=100 DELETE_YEAR_AND_OLDER=2020 node index.js
```

## Building from Source

```bash
# Install dependencies
npm install

# Run the GUI app
npm start

# Build distributable packages (portable + installer)
npm run build

# Output in dist/ folder:
# - Delete My Tweets 1.1.0.exe (portable)
# - Delete My Tweets Setup 1.1.0.exe (installer)
```

## Configuration

### GUI App Settings

| Setting | Description |
|---------|-------------|
| **Content Types** | Checkboxes to include Posts, Replies, and/or Reposts |
| **Delete Before** | Month and year threshold - delete tweets older than this |
| **Protect After** | Month and year threshold - never delete tweets newer than this |
| **Target Count** | Maximum number of tweets to delete per run |
| **Speed** | Aggressive (fast, 0.6-1s delays), Normal (1.2-2.2s), or Conservative (2.5-4s) |
| **Show browser window** | Toggle visible browser (faster + watch deletions live) |

### CLI Environment Variables

#### Required
| Variable | Description |
|----------|-------------|
| `PROFILE_HANDLE` | Your X handle (without @). Pass as arg or env var. |

#### Date Filtering
| Variable | Default | Description |
|----------|---------|-------------|
| `DELETE_MONTH` | `12` | Delete tweets before this month (1-12) |
| `DELETE_YEAR` | `2014` | Delete tweets before this year |
| `PROTECT_MONTH` | `01` | Protect tweets after this month (1-12) |
| `PROTECT_YEAR` | `2025` | Protect tweets from this year and newer |
| `DELETE_YEAR_AND_OLDER` | `2014` | (Legacy) Delete tweets from this year and older |
| `PROTECT_YEAR_AND_NEWER` | `2025` | (Legacy) Never delete tweets from this year and newer |

#### Behavior
| Variable | Default | Description |
|----------|---------|-------------|
| `TARGET` | `200` | Maximum tweets to delete per run |
| `INCLUDE_POSTS` | `true` | Delete regular posts |
| `INCLUDE_REPLIES` | `true` | Delete replies |
| `HANDLE_REPOSTS` | `false` | Also undo retweets/reposts |
| `SPEED` | `normal` | Speed preset: `aggressive`, `normal`, or `conservative` |
| `HEADLESS` | `false` | Run browser in headless mode |

#### Timing
| Variable | Default | Description |
|----------|---------|-------------|
| `MIN_DELAY_MS` | `1200` | Minimum delay between actions (ms) |
| `MAX_DELAY_MS` | `2200` | Maximum delay between actions (ms) |
| `LOGIN_WAIT_MS` | `180000` | Time to wait for manual login (3 min) |

#### Scrolling
| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_SCROLL_PASSES` | `5` | Maximum scroll attempts per batch |
| `SCROLL_MIN_WAIT_MS` | `300` | Minimum scroll wait (ms) |
| `SCROLL_MAX_WAIT_MS` | `600` | Maximum scroll wait (ms) |

## CLI Examples

### Delete all tweets from 2020 and older
```bash
DELETE_YEAR_AND_OLDER=2020 PROTECT_YEAR_AND_NEWER=2024 node index.js myhandle
```

### Delete only replies, protect everything from 2023+
```bash
INCLUDE_POSTS=false INCLUDE_REPLIES=true DELETE_YEAR_AND_OLDER=2022 PROTECT_YEAR_AND_NEWER=2023 node index.js myhandle
```

### Run in headless mode (no visible browser)
```bash
HEADLESS=true node index.js myhandle
```

### Also remove old retweets
```bash
HANDLE_REPOSTS=true node index.js myhandle
```

## First Run / Login

On first run (or if session expired after 24 hours):
1. Browser opens to x.com
2. Log in manually within 3 minutes
3. App verifies you're logged into the correct account
4. Session is saved per-account to `x_auth_<handle>.json`
5. Future runs use saved session (until 24-hour expiry)

## Safety Features

- **Never deletes recent tweets**: Configurable protection date
- **Skips unknown dates**: If date can't be determined, tweet is skipped
- **Account verification**: Confirms logged-in account matches specified handle
- **Per-account sessions**: Separate session storage for each X account
- **24-hour session expiry**: Forces re-login daily for security
- **Configurable delays**: Avoid rate limiting

## Project Structure

```
deletemytweets/
├── app.html           # Electron GUI interface
├── electron-main.js   # Electron main process
├── index.js           # CLI tool / core logic
├── package.json       # Dependencies and build config
├── START_APP.bat      # Windows launcher script
├── icon.ico           # App icon
└── dist/              # Built executables (after npm run build)
    ├── Delete My Tweets 1.1.0.exe        # Portable executable
    └── Delete My Tweets Setup 1.1.0.exe  # Windows installer
```

## Tech Stack

- **Electron** - Desktop app framework
- **Playwright** - Browser automation
- **better-sqlite3** - Direct Edge cookie access for logout
- **Chalk/Boxen/Ora** - Terminal UI (CLI mode)
- **electron-builder** - App packaging

## Recent Updates (Jan 2026)

### Session Management
- **Dynamic Login/Logout button** - Button changes state based on session
- **Direct Edge cookie clearing** - Logout clears cookies without opening browser (uses SQLite)
- **First-time login notification** - Helpful prompt for new users

### Real-Time Stats
- **Live progress updates** - Stats update immediately when tweets are deleted/protected/skipped
- **Per-account history** - Deletion history saved locally for each account

### UI Design: Holographic Pulse

Glassmorphic dark theme with neon accents:

| Element | Color | Hex |
|---------|-------|-----|
| Primary | Magenta | `#FF00E6` |
| Secondary | Cyan | `#00FFD1` |
| Accent | Purple | `#7C3BFF` |
| Background | Dark | `#1B0B3B` |
| Alert | Coral | `#FF2A6D` |

## License

MIT
