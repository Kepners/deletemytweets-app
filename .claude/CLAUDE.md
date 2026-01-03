# Delete My Tweets - Project Knowledge Base

## Quick Reference

| Item | Value |
|------|-------|
| **Version** | 1.1.0 |
| **App ID** | com.choppedonions.deletemytweets |
| **Product** | ChoppedOnions.xyz |
| **Platforms** | Windows, macOS |
| **License Format** | DMT-XXXX-XXXX-XXXX-XXXX |

---

## Project Structure

```
deletemytweets-app/
├── electron-main.js      # Main process (license, IPC, Playwright)
├── app.html              # UI (glassmorphic design)
├── index.js              # CLI version
├── package.json          # Config & dependencies
├── icon.ico / icon.icns  # App icons
├── vercel.json           # Serverless config
├── api/
│   ├── validate-license.js   # POST /api/validate-license
│   └── stripe-webhook.js     # Handles Stripe events
├── .github/workflows/
│   └── build.yml         # CI/CD for Win + Mac
└── docs/
    ├── APP_DOCUMENTATION.md
    └── ARCHITECTURE.md
```

---

## Key URLs

| Purpose | URL |
|---------|-----|
| API Base | https://deletemytweets.app |
| Validate License | https://deletemytweets.app/api/validate-license |
| Webhook | https://deletemytweets.app/api/stripe-webhook |
| Buy License | https://buy.stripe.com/00w3cv9Vi6018hs8up0co00 |
| GitHub Repo | https://github.com/Kepners/deletemytweets-app |

---

## Important Files

### electron-main.js
- **Line ~203**: `LICENSE_API_URL` - API endpoint for validation
- **Line ~253-311**: `activate-license` IPC handler
- **Line ~86-91**: License check in `start-cleanup` handler

### app.html
- **Line ~945-1016**: License card (collapsible)
- **Line ~1018-1023**: Footer with ChoppedOnions.xyz branding
- **Line ~1250-1283**: `updateLicenseDisplay()` and `toggleLicenseDetails()`
- **Line ~1721-1726**: License check in `startCleanup()`

### api/validate-license.js
- Searches all Stripe customers for `metadata.license_key` match
- Returns `{ valid: true/false, email }`

### api/stripe-webhook.js
- Handles `checkout.session.completed` → generates license key
- Handles `charge.refunded` → revokes license
- Stores license in customer metadata

---

## License System

### How It Works
1. User buys via Stripe Payment Link
2. Webhook generates `DMT-XXXX-XXXX-XXXX-XXXX` key
3. Key stored in Stripe customer metadata
4. User enters key in app
5. App validates via API (searches Stripe customers)
6. If valid, saved locally to `%APPDATA%/deletemytweets/license.json`
7. App works offline after initial activation

### Test License
Create in Stripe Dashboard:
1. Create customer with email
2. Add metadata: `license_key` = `DMT-TEST-ABCD-1234-WXYZ`
3. Add metadata: `license_status` = `active`

---

## Build Commands

```bash
npm start           # Run in development
npm run build       # Build Windows (portable + installer)
npm run build:mac   # Build macOS (dmg + zip)
npm run build:all   # Build both platforms
```

### Windows Defender Fix
Build gets stuck on "file locked":
```powershell
# Run as Admin
Add-MpPreference -ExclusionPath "C:\path\to\project\dist"
```

### Release Build
```bash
git tag v1.1.0
git push origin v1.1.0
# GitHub Actions builds both platforms
# Creates draft release at /releases
```

---

## Environment Variables (Vercel)

| Variable | Source |
|----------|--------|
| `STRIPE_API_KEY` | Stripe Dashboard → API Keys → Secret key (sk_live_...) |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks → Signing secret (whsec_...) |

---

## IPC Channels

### Main → Renderer
- `license-status` - License state on startup
- `cleanup-progress` - Deletion progress updates
- `cleanup-complete` - Completion stats
- `cleanup-error` - Error messages

### Renderer → Main
- `activate-license` - Validate & save license key
- `deactivate-license` - Remove local license
- `start-cleanup` - Begin deletion with settings
- `stop-cleanup` - Abort deletion
- `open-external` - Open URL in default browser

---

## UI Components

### Collapsible License Card
- Default: Shows only "Status: Active ✓"
- Click to expand: Shows key, details, buttons
- CSS class: `.license-collapsible`, `.expanded`
- Toggle function: `toggleLicenseDetails(event)`

### Browser Toggles (in Options section)
- Show browser - Toggle automation visibility
- Private browser - Use incognito mode

### Speed Warning
- Appears when "Fast" mode selected
- ID: `#speedWarning`

---

## Stripe Setup Checklist

- [x] Create product "Delete My Tweets License"
- [x] Create price (one-time)
- [x] Create Payment Link
- [x] Set up webhook endpoint
- [x] Configure webhook events:
  - `checkout.session.completed`
  - `charge.refunded`
- [x] Add env vars to Vercel

---

## Common Issues & Fixes

### Build stuck waiting for file lock
Add Windows Defender exclusion for `dist/` folder

### License validation fails
Check Stripe customer has `license_key` in metadata
Check API env vars are set in Vercel

### Mac app shows security warning
Expected for unsigned apps. Users right-click, Open, Open anyway

### IPC not working
Check channel names match exactly
Check `nodeIntegration: true` in BrowserWindow

---

## Development Notes

### Adding New Features
1. Add IPC handler in electron-main.js
2. Add IPC send/receive in app.html
3. Update UI as needed
4. Test locally with `npm start`
5. Build and test executable

### Modifying License System
- API changes: Update `api/validate-license.js`
- Webhook changes: Update `api/stripe-webhook.js`
- UI changes: Update license section in `app.html`
- Main process: Update handlers in `electron-main.js`

### Version Bump
1. Update `version` in package.json
2. Update version in footer (app.html ~line 1020)
3. Commit and tag: `git tag v1.x.x`
4. Push tag to trigger build
