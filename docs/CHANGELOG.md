# Changelog

## [0.4.1] - 2026-10-09

### Fixed

- In a new session, a saved limit whose window had reset since was dropped, so its edge was missing until the first reply. It now comes back at 0%.

## [0.4.0] - 2026-10-09

The first public release.

### Added

- Desktop replies drawn with the app's own markdown and code views, so they keep its typography and follow light and dark mode.
- GitHub alerts as rounded cards.
- Mermaid flowcharts, state and sequence diagrams and `xychart-beta` charts as full-width SVG that switches with the theme, with **Open large** (zoom and pan) and **Copy source**.
- A frame in the band above the prompt, always on: the 5-hour limit on its top edge and the 7-day limit on its bottom edge, each growing with the share used; the context window as weather on the right; subagents and tasks inside while they run.
- The last known limits carried into a new session.
- `/colorwheel` to show every element, and `/colorwheel progress` for a demo of the band.
- A one-line version of the band in the terminal.
