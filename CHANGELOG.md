# Changelog

All notable changes to Streamplan Maker are documented here. Each entry becomes the GitHub release notes for that version, and is also shown in the in-app "update ready" popup.

## [1.0.3] - 2026-07-21

### Fixed
- The "update ready" popup no longer shows raw HTML tags as visible text — GitHub delivers release notes as pre-rendered HTML, not markdown, so the popup now displays it directly instead of running it through a markdown parser that never matched.
- The "Restart & Install" buttons had a stray double ampersand ("Restart && Install").

## [1.0.2] - 2026-07-21

### Added
- 6 new animated templates — Aurora Cascade, Comet Trail, Starlit Ledger, Nova Burst, Meteor Row, and Eclipse Veil — each with its own new layout (Cascade Flow, Orbit Ring, Nova Radiate, Meteor Row) and an animated cosmic background inspired by the app's Galaxy Veil theme.
- A "Background Motion" option in Customize, so any template can turn on nebula drift, aurora, starfield, nova pulse, or meteor shower motion.

### Changed
- Animated GIF export no longer adds an automatic glow-pulse/light-sweep to every export — a GIF now only animates from what's actually part of the plan (an animated template background, or your own uploaded GIF stickers).

## [1.0.1] - 2026-07-21

### Added
- In-app popup that appears once an update has finished downloading, showing exactly what's new before you restart to install.

### Changed
- The glow around the editor's canvas area now follows your selected app theme's accent color instead of always being purple.

### Fixed
- Desktop and Start Menu shortcuts now refresh their icon right after install/uninstall, instead of sometimes showing a stale placeholder icon until Windows' icon cache caught up.

## [1.0.0] - 2026-07-21

### Added
- Initial public release.
- Seven-day schedule editor with 8 built-in layout variants, plus a fully free-form Layout Editor.
- Full style customization: colors, fonts, backgrounds, custom image/GIF stickers.
- Custom Templates and Custom Layouts, savable to a permanent library and exportable/importable as standalone files.
- Export to PNG, JPG, PDF, and animated GIF at 1080p/2K/4K.
- Project save/load, autosave, and 25 selectable app UI themes.
- Native Windows installer with Start Menu and Desktop shortcuts, and a built-in auto-updater.
