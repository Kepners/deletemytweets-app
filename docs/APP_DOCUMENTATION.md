# Delete My Tweets - Complete Documentation

## Overview

**Delete My Tweets** is a desktop application that helps users safely delete old tweets from their X (Twitter) account while protecting recent ones. It uses browser automation (Playwright) to interact with X's web interface.

**Version:** 1.1.0
**Developer:** ChoppedOnions.xyz
**Platforms:** Windows, macOS

---

## Features

### Core Functionality
- **Date-Range Deletion**: Delete tweets within a specific date range
- **Protection Period**: Protect tweets newer than a specified date
- **Target Limit**: Set maximum number of tweets to delete per session
- **Content Types**: Delete posts, replies, and/or reposts selectively

### Speed Modes
| Mode | Description | Best For |
|------|-------------|----------|
| Fast | Aggressive deletion, minimal delays | Under 100 tweets |
| Normal | Balanced speed and safety | 100-500 tweets |
| Safe | Conservative, longer delays | 500+ tweets |

### Browser Options
- **Show Browser**: Toggle visibility of the automation browser
- **Private Browser**: Use incognito/private browsing mode

### Account Management
- Multiple account support
- Session persistence
- Quick account switching

### License System
- One-time purchase, lifetime access
- 2 device activation limit
- Server-validated via Stripe

---

## Technical Stack

### Desktop App
- **Framework**: Electron 28.3.3
- **Automation**: Playwright 1.40.0
- **Database**: better-sqlite3 (session storage)
- **UI**: Custom HTML/CSS (glassmorphic design)

### Backend (Vercel Serverless)
- **License Validation API**: `/api/validate-license`
- **Stripe Webhook**: `/api/stripe-webhook`

### Payment Processing
- **Provider**: Stripe
- **Method**: Payment Links
- **License Storage**: Stripe Customer Metadata

---

## File Structure

```
deletemytweets-app/
├── electron-main.js      # Main Electron process
├── app.html              # UI (renderer process)
├── index.js              # CLI version
├── package.json          # Dependencies & build config
├── icon.ico              # Windows icon
├── icon.icns             # macOS icon
├── vercel.json           # Vercel deployment config
├── api/
│   ├── validate-license.js   # License validation endpoint
│   └── stripe-webhook.js     # Stripe webhook handler
├── .github/
│   └── workflows/
│       └── build.yml     # GitHub Actions CI/CD
└── dist/                 # Build output
    ├── Delete My Tweets 1.1.0.exe      # Portable
    ├── Delete My Tweets Setup 1.1.0.exe # Installer
    └── win-unpacked/     # Unpacked app
```

---

## Configuration

### Environment Variables (Vercel)

| Variable | Description |
|----------|-------------|
| `STRIPE_API_KEY` | Stripe Secret Key (sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (whsec_...) |

### Build Configuration (package.json)

```json
{
  "build": {
    "appId": "com.choppedonions.deletemytweets",
    "productName": "Delete My Tweets",
    "win": {
      "target": ["portable", "nsis"],
      "icon": "icon.ico"
    },
    "mac": {
      "target": ["dmg", "zip"],
      "icon": "icon.icns",
      "category": "public.app-category.utilities"
    }
  }
}
```

---

## License System Flow

### Purchase Flow
```
1. User clicks "Buy License" in app
   ↓
2. Opens Stripe Payment Link
   ↓
3. User completes payment
   ↓
4. Stripe webhook fires (checkout.session.completed)
   ↓
5. Webhook generates license key: DMT-XXXX-XXXX-XXXX-XXXX
   ↓
6. License stored in Stripe customer metadata
   ↓
7. User receives license key (via Stripe receipt or email)
```

### Activation Flow
```
1. User enters license key in app
   ↓
2. App validates format locally (DMT-XXXX-XXXX-XXXX-XXXX)
   ↓
3. App calls API: POST /api/validate-license
   ↓
4. API searches Stripe customers for matching license_key metadata
   ↓
5. If valid: Returns { valid: true, email: "..." }
   ↓
6. App saves license locally to: %APPDATA%/deletemytweets/license.json
   ↓
7. UI unlocks, cleanup features enabled
```

### Offline Support
- License validated once, then cached locally
- App works offline after initial activation
- Re-validation only on license change

---

## IPC Communication

### Main Process → Renderer
| Channel | Data | Description |
|---------|------|-------------|
| `license-status` | `{licenseKey, email}` | License state on startup |
| `cleanup-progress` | `{deleted, total, status}` | Deletion progress |
| `cleanup-complete` | `{deleted, errors}` | Completion stats |
| `cleanup-error` | `{message}` | Error notification |

### Renderer → Main Process
| Channel | Data | Description |
|---------|------|-------------|
| `start-cleanup` | `{settings...}` | Begin deletion |
| `stop-cleanup` | - | Abort deletion |
| `activate-license` | `licenseKey` | Validate & save license |
| `deactivate-license` | - | Remove local license |
| `open-external` | `url` | Open URL in browser |

---

## Security Measures

### License Protection
- Server-side validation (can't be bypassed locally)
- License key format validation
- Stripe metadata as source of truth
- UI disabled without valid license

### Data Safety
- No tweet data sent to servers
- All deletion happens client-side via browser
- Sessions stored locally only
- Private browser mode available

---

## Build & Deployment

### Local Development
```bash
npm install
npm start          # Run in development
npm run build      # Build Windows executables
```

### Production Build (GitHub Actions)
```bash
git tag v1.1.0
git push origin v1.1.0
# Triggers build for Windows + Mac
# Creates draft release with artifacts
```

### Vercel Deployment
- Auto-deploys on push to main
- API endpoints at: https://deletemytweets.app/api/*

---

## URLs & Endpoints

| Purpose | URL |
|---------|-----|
| Website | https://deletemytweets.app |
| Buy License | https://buy.stripe.com/00w3cv9Vi6018hs8up0co00 |
| Validate License | https://deletemytweets.app/api/validate-license |
| Stripe Webhook | https://deletemytweets.app/api/stripe-webhook |
| GitHub Repo | https://github.com/Kepners/deletemytweets-app |

---

## Troubleshooting

### "License not valid"
1. Check internet connection
2. Verify license key format (DMT-XXXX-XXXX-XXXX-XXXX)
3. Ensure Stripe customer has `license_key` in metadata

### Build stuck on "file locked"
- Add `dist/` folder to Windows Defender exclusions
- PowerShell (Admin): `Add-MpPreference -ExclusionPath "path\to\dist"`

### Mac app shows "unidentified developer"
- Right-click → Open → Open anyway (unsigned app)

---

## Version History

### v1.1.0 (Production)
- Server-side license validation via Stripe
- Collapsible license UI
- Grouped browser toggles
- Speed warning for Fast mode
- macOS build support
- ChoppedOnions.xyz branding
