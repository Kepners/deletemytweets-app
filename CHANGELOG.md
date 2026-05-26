# Changelog

All notable changes to this project will be documented in this file.

## [1.3.43] - 2026-05-26

### Fixed
- **Login now verifies the actual X account before saving a session.**
  - The desktop Login button no longer treats any existing X `auth_token` cookie as proof for the typed handle.
  - If the browser is already signed in to a different X account, the app reports that mismatch instead of saving a mislabeled session.
- **Session status now honors the documented 24-hour expiry.**
  - Expired session files are cleared when the GUI checks account status.
  - GUI cleanup now requires a verified per-handle login marker instead of trusting older unverified cookie files.
  - The cleanup engine now matches the README's daily re-login behavior.

## [1.3.42] - 2026-05-25

### Fixed
- **Rolling delete windows now include the current month.**
  - Selecting "delete recent N months" no longer protects current-month posts by mistake.
  - The desktop timeline label now matches the months the cleanup engine targets.

## [1.3.41] - 2026-04-02

### Fixed
- **Windows packaging now uses a buildable `better-sqlite3` release.**
  - Downgraded the native dependency to `11.10.0`, which still ships Electron 28 prebuilds.
  - This avoids the local Visual Studio C++ toolchain requirement during release builds.
  - The logout path keeps its existing Edge cookie cleanup behavior.

## [1.3.40] - 2026-04-02

### Changed
- **Fresh installs now default to rolling date windows.**
  - New GUI launches start in rolling keep mode so the selection follows the current month.
  - Legacy fixed-date configs now show a warning banner so users can migrate at their own pace.
  - The rolling range is still configurable for both "delete recent N months" and "keep recent N months".

### Fixed
- **Protect mode** now works in the GUI instead of falling back to delete mode.
- **Stale protect defaults** no longer hard-code an old year for new runs.

## [1.3.39] - 2026-04-02

### Fixed
- **Rolling date windows** now follow the current month at runtime.
  - Added rolling window support for "delete recent N months" and "keep recent N months".
  - Wired selection mode through the Electron bridge so the GUI and CLI stay in sync.
- **Protect mode** now works in the GUI instead of falling back to delete mode.
- **Stale protect defaults** no longer hard-code an old year for new runs.

## [1.3.38] - 2026-02-27

### Fixed
- **Strict deletion verification** to avoid false positives.
  - Action success now requires the target status card to disappear from the timeline.
  - Added a post-delete status URL verification check before counting deletion success.
  - Removed permissive success path based on locator key drift.
  - Work items now track status IDs and reacquire cards by status ID before acting.
- **Misleading delete logs** in the desktop app.
  - Candidate tweets no longer emit delete-style logs before confirmation.
  - Delete log styling now only applies to explicit `Deleted confirmed` entries.
- **Menu targeting resilience** for X UI variants.
  - Added fallback "More" button selectors beyond `data-testid="caret"`.
- **Anti-detection settings now actually wired through runtime.**
  - Added `useFirefox` and `proxy` flow from GUI -> Electron env -> automation engine.
  - Added Firefox private mode vs profile mode behavior (private toggle now changes runtime mode).
  - Added Firefox launch path with Chromium fallback and proxy support.
- **Progress counter reliability** in the desktop app.
  - Added structured `protected` and `skipped` events from the automation engine.
  - Removed log-text counter increments that could drift from real counts.

## [1.3.37] - 2026-02-25

### Fixed
- **Deletion success over-reporting** in the Playwright engine.
  - Delete/unrepost actions no longer report success when click/confirm fails.
  - Added post-action verification before counting a tweet as removed.
  - Added retry handling for transient action-confirmation failures.
- **Progress and completion reporting** in the desktop app.
  - Progress percent now reflects confirmed deletions vs target.
  - Completion status now distinguishes `Complete`, `Finished`, `Stopped`, and `Failed`.
  - Runtime process failures now surface through the cleanup error channel instead of appearing as successful completion.

## [1.1.0] - 2026-01-01

### Added
- **Desktop GUI App** - Modern Electron-based interface
  - Dark-themed glassmorphism UI design
  - Custom frameless window with drag-able titlebar
  - Profile section with avatar and handle display
  - Content type checkboxes (Posts, Replies, Reposts)
  - Month + Year selectors for precise date filtering
  - **Speed slider** - Choose Aggressive (fast), Normal, or Conservative (safe) deletion speed
  - Real-time progress bar and activity log
  - Config persistence between sessions
  - **Headless mode** - Browser runs invisibly in background
- **Build System**
  - Portable executable (no install required)
  - NSIS installer with custom install directory
  - electron-builder integration
- **Launcher Script** - `START_APP.bat` for easy Windows launching

### Changed
- Date filtering now supports month-level precision (not just year)
- Labels updated: "Delete Before" and "Protect After" for clarity
- Taller window (850px) to show progress without scrolling

## [1.0.0] - 2025-12-31

### Added
- Initial release
- Date-filtered tweet deletion (delete old, protect recent)
- Configurable year thresholds
- Posts and replies support
- Optional repost/retweet undoing
- Multi-language menu detection
- Session persistence
- Headless mode support
- Comprehensive logging with tweet previews
