# Streamplan Maker

**Streamplan Maker** is a Windows desktop app for designing and exporting polished weekly stream-schedule graphics — the kind of "what's on this week" image streamers post to Twitter/X, Discord, or their channel banner. Everything is edited live: change a day, a color, or a font and the preview updates instantly, with no round-trip to an external design tool.

## Overview

Building a stream schedule graphic usually means wrestling with a generic design tool for something that's really a data-entry problem: seven days, some times, maybe a note per day, wrapped in a look that matches your brand. Streamplan Maker treats it that way — fill in your week on one side, tune the look on the other, watch the full-resolution result update in real time in the middle, then export it.

## Features

### Schedule & Layout
- Seven-day schedule editor — per-day start/end time, day-off toggle, and an optional note.
- 8 built-in layout variants: List Rows, Grid Nodes, Vertical Timeline, Calendar Columns, Compact Badges, Weekday/Weekend Split, Radial Clock, and Ticket Stubs.
- **Layout Editor** — a fully free-form alternative to the built-in layouts. Drag, resize, and rotate the seven day cards, the header, and the logo anywhere on the canvas; z-order control (bring to front / send to back); per-element style overrides (corner style including a fully-rounded "pill" shape, accent color, accent stripe on/off, opacity). Layouts save to a permanent library and export/import as standalone `.splayout` files, with imported layouts locked against edits to protect the original author's design.

### Customization
- Full color system (background, gradient end, card panel, accent x2, text, muted text, glow), font pickers for heading/body with adjustable size, corner style, and background mode (solid / gradient / custom image).
- **Custom Templates** — save an entire look (colors, fonts, background, logo, layout) as a named template, reusable across schedules, exportable/importable as `.sptemplate` files.
- Custom font uploads (`.ttf` / `.otf`) that become a permanent, reusable library across all templates.
- Custom image and animated GIF sticker uploads with per-image position/scale controls, including animated playback in the live preview and in exported GIFs.
- Background and logo images get a pixel-accurate live preview (using the exact same drawing code as the final export), with position/zoom sliders and recommended-size hints.

### Export & Projects
- Export to **PNG, JPG, PDF, or animated GIF** (with a glow/shimmer effect), at 1080p, 2K, or 4K.
- Save and reopen full projects (`.stplan`) to keep editing later.
- Autosave and restore-on-launch, so nothing is lost between sessions.

### App Experience
- 25 built-in app UI themes (12 static, 13 animated), independent of your streamplan's own design — purely how the editor itself looks.
- Configurable window mode (windowed / fullscreen / exclusive fullscreen) and live-preview frame rate.
- Built-in auto-updater — the installed app checks GitHub for new releases, downloads them in the background, and installs on next restart.
- Native Windows installer with Start Menu and Desktop shortcuts.

## Installation

Download the latest `Streamplan Maker-Setup-*.exe` from the [Releases](../../releases) page and run it. No admin rights required — it installs per-user and adds Start Menu and Desktop shortcuts. Once installed, the app checks for and installs updates on its own.

## Building from Source

Requirements: [Node.js](https://nodejs.org/) (with npm) on Windows.

```bash
npm install       # install dependencies
npm start         # run in development mode
npm run dist      # build the installer + unpacked app into dist/
npm run release   # build and publish a new version to GitHub Releases (requires a GH_TOKEN)
```

## Tech Stack

Electron (main/preload/renderer, contextIsolation on, no Node integration in the renderer), vanilla JavaScript with Canvas 2D for all rendering (a single `renderStreamplan()` function drives the live preview and every export path identically), `electron-builder` for packaging/NSIS installer, and `electron-updater` for auto-updates via GitHub Releases.

## License

See [LICENSE](LICENSE) for usage terms.
