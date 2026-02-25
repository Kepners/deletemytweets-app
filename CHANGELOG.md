# Changelog

All notable changes to this project will be documented in this file.

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
