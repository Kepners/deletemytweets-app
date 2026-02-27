# Changelog

All notable changes to this project will be documented in this file.

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
