# Software Architecture Template

A reusable architecture guide for indie developer desktop apps with licensing.

---

## System Overview Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER'S COMPUTER                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     ELECTRON APPLICATION                             │   │
│  │                                                                      │   │
│  │  ┌──────────────────┐         ┌──────────────────────────────────┐  │   │
│  │  │   Main Process   │  IPC    │        Renderer Process          │  │   │
│  │  │                  │◄───────►│                                  │  │   │
│  │  │  • License mgmt  │         │  • UI (app.html)                 │  │   │
│  │  │  • File I/O      │         │  • User interactions             │  │   │
│  │  │  • Playwright    │         │  • Display state                 │  │   │
│  │  │  • IPC handlers  │         │  • Send commands                 │  │   │
│  │  └────────┬─────────┘         └──────────────────────────────────┘  │   │
│  │           │                                                          │   │
│  └───────────┼──────────────────────────────────────────────────────────┘   │
│              │                                                              │
│              ▼                                                              │
│  ┌──────────────────────┐    ┌──────────────────────┐                      │
│  │  license.json        │    │  sessions.db         │                      │
│  │  (AppData)           │    │  (SQLite)            │                      │
│  └──────────────────────┘    └──────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                │
                │ HTTPS
                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLOUD SERVICES                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    VERCEL (Serverless Functions)                     │   │
│  │                    https://yourapp.app                               │   │
│  │                                                                      │   │
│  │  ┌─────────────────────────┐    ┌─────────────────────────────────┐ │   │
│  │  │  /api/validate-license  │    │    /api/stripe-webhook          │ │   │
│  │  │                         │    │                                  │ │   │
│  │  │  POST { licenseKey }    │    │  • checkout.session.completed   │ │   │
│  │  │  → { valid, email }     │    │    → Generate license key       │ │   │
│  │  │                         │    │    → Store in customer metadata │ │   │
│  │  │  Searches Stripe        │    │                                  │ │   │
│  │  │  customer metadata      │    │  • charge.refunded              │ │   │
│  │  │                         │    │    → Revoke license             │ │   │
│  │  └───────────┬─────────────┘    └─────────────────┬───────────────┘ │   │
│  │              │                                    │                  │   │
│  └──────────────┼────────────────────────────────────┼──────────────────┘   │
│                 │                                    │                      │
│                 ▼                                    ▼                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           STRIPE                                     │   │
│  │                                                                      │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │   │
│  │  │  Payment Links  │  │    Customers    │  │     Webhooks        │  │   │
│  │  │                 │  │                 │  │                     │  │   │
│  │  │  • Buy button   │  │  metadata: {    │  │  Events:            │  │   │
│  │  │  • £15 price    │  │    license_key  │  │  • checkout.done    │  │   │
│  │  │  • Checkout UI  │  │    license_stat │  │  • charge.refunded  │  │   │
│  │  │                 │  │  }              │  │                     │  │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Desktop Application (Electron)

```
electron-main.js (Main Process)
├── Window Management
│   └── createWindow() - BrowserWindow setup
├── License Management
│   ├── getLicenseData() - Read from license.json
│   ├── saveLicenseData() - Write to license.json
│   └── validateLicenseFormat() - DMT-XXXX-XXXX-XXXX-XXXX
├── IPC Handlers
│   ├── 'activate-license' - Validate & save
│   ├── 'deactivate-license' - Remove local license
│   ├── 'start-cleanup' - Begin automation
│   ├── 'stop-cleanup' - Abort automation
│   └── 'open-external' - Open URLs in browser
└── Automation (Playwright)
    ├── Browser launch (visible/headless)
    ├── Login flow
    └── Tweet deletion loop

app.html (Renderer Process)
├── UI Components
│   ├── Login section
│   ├── Settings panel
│   ├── Progress display
│   └── License card (collapsible)
├── State Management
│   └── hasValidLicense, settings, etc.
└── IPC Communication
    └── ipcRenderer.send() / .on()
```

### 2. Serverless API (Vercel)

```
api/
├── validate-license.js
│   ├── Input: POST { licenseKey: "DMT-XXXX-..." }
│   ├── Process: Search all Stripe customers for metadata match
│   └── Output: { valid: true/false, email: "...", error: "..." }
│
└── stripe-webhook.js
    ├── Verify webhook signature
    ├── Handle checkout.session.completed
    │   ├── Generate license: DMT-XXXX-XXXX-XXXX-XXXX
    │   └── Update customer metadata
    └── Handle charge.refunded
        └── Set license_status: "revoked"
```

### 3. Payment System (Stripe)

```
Setup Checklist:
├── Products
│   └── Create product (e.g., "Delete My Tweets License")
├── Prices
│   └── One-time price (e.g., £15)
├── Payment Links
│   └── Create link → Use in app's "Buy" button
├── Webhooks
│   ├── Endpoint: https://yourapp.app/api/stripe-webhook
│   └── Events: checkout.session.completed, charge.refunded
└── API Keys
    ├── Secret key → STRIPE_API_KEY (Vercel env)
    └── Webhook secret → STRIPE_WEBHOOK_SECRET (Vercel env)
```

---

## Data Flow Diagrams

### License Purchase Flow

```
User                App              Stripe           Vercel/Webhook
 │                   │                 │                    │
 │  Click "Buy"      │                 │                    │
 │──────────────────►│                 │                    │
 │                   │  Open Payment   │                    │
 │                   │  Link URL       │                    │
 │◄──────────────────│                 │                    │
 │                   │                 │                    │
 │  Complete Payment │                 │                    │
 │──────────────────────────────────►│                    │
 │                   │                 │                    │
 │                   │                 │  Webhook Event     │
 │                   │                 │───────────────────►│
 │                   │                 │                    │
 │                   │                 │  Generate License  │
 │                   │                 │  Store in Metadata │
 │                   │                 │◄───────────────────│
 │                   │                 │                    │
 │  Receipt + Key    │                 │                    │
 │◄──────────────────────────────────│                    │
 │                   │                 │                    │
```

### License Activation Flow

```
User                App (Renderer)    App (Main)         Vercel API        Stripe
 │                   │                 │                    │                │
 │  Enter Key        │                 │                    │                │
 │──────────────────►│                 │                    │                │
 │                   │  IPC: activate  │                    │                │
 │                   │────────────────►│                    │                │
 │                   │                 │                    │                │
 │                   │                 │  POST /validate    │                │
 │                   │                 │───────────────────►│                │
 │                   │                 │                    │                │
 │                   │                 │                    │  List Customers│
 │                   │                 │                    │───────────────►│
 │                   │                 │                    │                │
 │                   │                 │                    │  Search        │
 │                   │                 │                    │  Metadata      │
 │                   │                 │                    │◄───────────────│
 │                   │                 │                    │                │
 │                   │                 │  { valid: true }   │                │
 │                   │                 │◄───────────────────│                │
 │                   │                 │                    │                │
 │                   │                 │  Save license.json │                │
 │                   │                 │  (local)           │                │
 │                   │                 │                    │                │
 │                   │  IPC: status    │                    │                │
 │                   │◄────────────────│                    │                │
 │                   │                 │                    │                │
 │  UI Unlocked      │                 │                    │                │
 │◄──────────────────│                 │                    │                │
```

---

## Project Setup Checklist

### Phase 1: Foundation
- [ ] Initialize Git repository
- [ ] Create package.json with proper metadata
- [ ] Set up .gitignore (node_modules, dist, .env)
- [ ] Create basic Electron app structure
- [ ] Design UI mockup

### Phase 2: Core Features
- [ ] Implement main functionality
- [ ] Create IPC communication layer
- [ ] Add settings persistence
- [ ] Test core features

### Phase 3: Licensing System
- [ ] Create Stripe account
- [ ] Set up Stripe product & price
- [ ] Create Payment Link
- [ ] Create Vercel project
- [ ] Deploy webhook handler
- [ ] Deploy validation API
- [ ] Configure webhook in Stripe Dashboard
- [ ] Add environment variables to Vercel
- [ ] Implement license UI in app
- [ ] Connect app to validation API

### Phase 4: Build & Distribution
- [ ] Configure electron-builder
- [ ] Add Windows Defender exclusion for builds
- [ ] Set up GitHub Actions for CI/CD
- [ ] Create app icons (ico, icns)
- [ ] Test builds on all platforms
- [ ] Create GitHub Release

### Phase 5: Launch
- [ ] Set up custom domain
- [ ] Test complete purchase flow
- [ ] Test license activation flow
- [ ] Add branding/attribution
- [ ] Write documentation
- [ ] Publish release

---

## Key Files Template

### vercel.json
```json
{
  "version": 2,
  "builds": [
    { "src": "api/*.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" }
  ]
}
```

### License Key Format
```
Pattern: XXX-XXXX-XXXX-XXXX-XXXX
Example: DMT-A1B2-C3D4-E5F6-G7H8

Generation:
const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const segment = () => Array(4).fill(0).map(() =>
  chars[Math.floor(Math.random() * chars.length)]
).join('');
const key = `DMT-${segment()}-${segment()}-${segment()}-${segment()}`;
```

### GitHub Actions Workflow
```yaml
name: Build Apps
on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4

  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run build:mac
      - uses: actions/upload-artifact@v4
```

---

## Lessons Learned

### Do From The Start
1. **Work out of GitHub** - Version control from day one
2. **Plan licensing early** - Affects architecture decisions
3. **Set up CI/CD early** - Automated builds save time
4. **Create architecture docs** - Reference for future you
5. **Use environment variables** - Never hardcode secrets

### Common Gotchas
1. **Windows Defender** blocks Electron builds → Add exclusions
2. **Stripe webhooks** need signature verification
3. **macOS unsigned apps** show security warnings
4. **IPC in Electron** is async, handle properly
5. **License validation** should have offline fallback

### Indie Developer Stack (Recommended)
| Component | Service | Cost |
|-----------|---------|------|
| Desktop App | Electron | Free |
| Hosting/API | Vercel | Free tier |
| Payments | Stripe | 2.9% + 30¢ |
| Domain | Any registrar | ~$12/year |
| CI/CD | GitHub Actions | Free for public repos |
| Code Signing (Mac) | Apple Developer | $99/year (optional) |

---

## Environment Variables Reference

### Vercel (Production)
```
STRIPE_API_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Local Development
```
STRIPE_API_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe CLI)
```

---

## Security Checklist

- [ ] License validated server-side (not just client)
- [ ] Stripe webhook signatures verified
- [ ] No secrets in client-side code
- [ ] No secrets committed to Git
- [ ] Environment variables for all credentials
- [ ] API endpoints validate input format
- [ ] Error messages don't leak internal details
