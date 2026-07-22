# Changelog

All notable changes to Streamplan Maker are documented here. Each entry becomes the GitHub release notes for that version, and is also shown in the in-app "update ready" popup.

## [1.0.15] - 2026-07-23

### Fixed
- A Custom Template's Customize tab had no way to pick up a Custom Layout you'd built, saved, or imported without opening the full Template Studio — the Layout Editor's own "saved layout" list worked fine, but there was nowhere in the main window to apply one to a template directly, so imported layouts could feel like they'd vanished. Added a "Custom Layout" picker right there in the Customize tab.

## [1.0.14] - 2026-07-23

### Changed
- "Upload to Streamplan Hub" (added in 1.0.13) no longer publishes straight from the app. It now prepares the file, highlights it in File Explorer, and opens Streamplan Hub's own upload page with the name already filled in — so there's still a chance to add a preview image or adjust the name before it actually goes live.

## [1.0.13] - 2026-07-23

### Added
- The Layout Editor and Template Studio's "Export…" button is now a dropdown: export a local file as before, or upload straight to Streamplan Hub without leaving the app. Uploading uses the name already typed in the editor — Templates and Layouts without a name can't be uploaded, and the app tells you so if you try.

## [1.0.12] - 2026-07-23

### Added
- The guided tour now goes into real depth on the Customize and Assets tabs (colors, fonts, background & motion, custom image stickers, custom fonts) instead of one generic step, and it actually opens the Template Studio and the Layout Editor to walk through their own key tools — canvas, adding your own elements, the property panel, gradients & textures, drop shadows, and save/export — rather than just pointing at the buttons that open them.
- The tour's Settings step now also points out the Community tab's link to Streamplan Hub.

## [1.0.11] - 2026-07-22

### Added
- Streamplan Maker is now the companion app for [Streamplan Hub](https://streamplan-maker.online/), the new community site for publishing and downloading Templates & Custom Layouts. Clicking a download button there now opens Streamplan Maker directly and drops the Template or Layout straight into the Template Studio / Layout Editor library, ready to pick — no manual file download needed.
- A new "Community" tab in Settings links straight to Streamplan Hub.

## [1.0.10] - 2026-07-22

### Fixed
- In Custom Layout mode, days you aren't currently streaming on now disappear from the plan entirely, matching every built-in layout — previously their card stayed visible (empty) instead of being hidden along with the rest of that day's elements.

## [1.0.9] - 2026-07-22

### Fixed
- The packaged app's own icon (taskbar, Task Manager, and other places that read the .exe file directly) still showed the default Electron icon, even after v1.0.8's fix for it being missing from the app bundle. electron-builder was configured to skip embedding the icon into the .exe entirely.

## [1.0.8] - 2026-07-22

### Added
- The exported plan graphic itself is now translated when the app is set to German — title, day labels ("MO"/"DI"/…), and "bis"/empty-state text — not just the app's own menus.
- In Custom Layout mode (Layout Editor / Template Studio), every day's start time and duration are now their own independently drag/resize/rotate-able elements, instead of being fixed to their day card.
- A "Logo Size" slider (Assets tab), separate from the existing crop/zoom control, for the 8 built-in layout variants' header logo.
- Custom image stickers can now be dragged directly on the live preview canvas, in addition to the existing position sliders.
- Each day in the schedule can now have its own optional image (e.g. game cover art), shown inside that day's card on every layout and card skin.
- The Schedule panel's day checkboxes (Monday, Tuesday, …) are now translated in German too, matching the rest of the app.
- Switching language now shows a loading screen while the app reloads, and asks you to confirm first since it's a full app reload.
- A guided first-run tour: on first launch (or after updating from a version that predates it), the app asks whether you'd like a quick tour. It walks through the project bar, schedule, live preview, style panel, export, Layout Editor, and Settings with an on-screen spotlight. Skipping asks you to confirm first, since the app can be a lot to take in at once. Replay it anytime from the new "❔ Tour" button in the top bar.

### Fixed
- The app's own icon was missing from packaged builds, which also broke it from refreshing correctly after an auto-update.

## [1.0.6] - 2026-07-22

### Added
- Template Studio: a new full-screen editor for Custom Templates that unifies style editing (colors, fonts, background, images) and live element editing (drag/resize/rotate, add text/shapes/images) into one place, opened from the Templates tab's "Open Template Studio" button.
- Advanced multi-stop gradient editor for backgrounds, with adjustable angle — an alternative to the simple two-color fade.
- Procedural background textures (Grain, Dots, Diagonal Lines, Grid), layered on top of any background.
- Per-element drop shadows (color, blur, offset, opacity), available on every element type and stackable with the existing pulsing "Glow" animation.
- The Layout Editor's "+ Shape" button now opens a picker with 6 new shapes (Triangle, Diamond, Pentagon, Hexagon, Star, Arrow) alongside the existing Rectangle, Ellipse, and Line, instead of always adding a rectangle first.

### Fixed
- The Layout Editor's "Use Template Font" reset button (for a selected element's font override) crashed instead of resetting the font.

## [1.0.5] - 2026-07-22

### Added
- A Language tab in Settings — the app's own interface (menus, panels, buttons, hints) can now be switched between English and a full German translation. Your exported streamplan design itself is unaffected either way.

### Fixed
- The "Export Plan" button could clip part of its own label in German (longer translated text got cut off instead of fitting the button).

## [1.0.4] - 2026-07-21

### Added
- The Layout Editor is now much more free-form: day cards can borrow the visual look of the app's other layouts (Badge Node, Calendar Cell, Ticket Stub, Compact Inline, Ring Badge — a new "Card Skin" option per card), and you can now add your own Text, Shape, and Image elements anywhere on the canvas alongside the day cards, header, and logo.
- Any element in the Layout Editor can have its own font uploaded directly from the editor, instead of only the template's global heading/body font.
- Any element in the Layout Editor can now be animated on its own (Pulse, Drift, Bob, Glow, Spin) — visible live while editing, in the main preview, and in exported GIFs.

### Changed
- If you're several versions behind, the app now updates straight to the newest version in one step (it already did) and the update-ready popup now shows what changed across every version you skipped, not just the very latest one.

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
