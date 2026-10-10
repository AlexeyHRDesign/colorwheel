# Changelog

## [0.4.0] - 2026-10-09

### Added

- A README with images drawn by the mod's own code (`scripts/readme-images.ts`), a logo and a social preview.

### Changed

- Progress text that runs into the metrics fades out instead of cutting a word.
- Each limit's whole edge shows its tooltip, not only its label.
- An empty frame says it waits for the first reply.

## [0.3.8] - 2026-10-09

### Changed

- Each limit's edge is as long as the share used, growing from the left, so 90% reads as a long line and matches its percent.

## [0.3.7] - 2026-10-09

### Changed

- The frame sits half as far inside the app's block: the band pulls it one cell out past the app's padding and gives 6 px back on the sides.

### Fixed

- `/colorwheel progress` with words after it played nothing; the command reads only its first word.

## [0.3.6] - 2026-10-09

### Fixed

- The band was still refused with nothing beneath it: `next(e)` then resolves to the engine's own node, which the app refuses under a Box that sets `width`. The Boxes that hold it no longer set one.

## [0.3.5] - 2026-10-09

### Fixed

- The band never drew when no other mod drew beneath it: `next(e)` rejects there instead of resolving empty, and the hook failed. This hid the progress row from the start, Token Weather or not.

## [0.3.4] - 2026-10-09

### Fixed

- The desktop frame did not show: the Svg had no px width, and the app does not size an Svg from a percent width. It gets one again, a little under the transcript column, and its markup stretches to it.

### Changed

- The desktop frame always shows, not only while tasks run.
- The last known 5-hour and 7-day limits are kept across sessions and show at once in a new one, until a fresh reading or their reset time.

## [0.3.3] - 2026-10-09

### Changed

- Each limit's percent sits on its edge, in a gap just past where the colour ends (before it, near the right corner), with the reset time in its tooltip. The 5h and 7d labels on the right are gone; the context label stays.

## [0.3.2] - 2026-10-09

### Changed

- One frame instead of three nested ones: its top edge, in blue, is the 5-hour limit and its bottom edge, in orange, the 7-day limit, each wiped from the right by the share used. Context is a label with its tooltip.

## [0.3.1] - 2026-10-09

### Fixed

- The band frame sizes itself to the slot the app gives it instead of a width guessed from columns, which overflowed and hid the metrics.

### Changed

- A frame's cut end fades out instead of stopping hard.

## [0.3.0] - 2026-10-09

### Added

- Context weather built in, replacing Token Weather, which never handed the band on and so hid the progress row. On desktop the band is one frame inside the app's block: nested rounded frames for the context window, the 5-hour and the 7-day limits, each in its own colour and wiped from the right by the share used. Each metric shows an icon or tag and a percent, with details (tokens, recent turns, reset times) in its tooltip. Tasks fill the inside from the left.
- The terminal draws the same metrics as a short line of text after the progress row.

### Fixed

- `/colorwheel progress` timers report a failure as a toast instead of dropping it.

## [0.2.1] - 2026-10-06

### Added

- `/colorwheel progress` plays a 20-second demo of the progress row.

## [0.2.0] - 2026-10-06

### Added

- A progress row above the prompt while subagents or tasks run: subagents running and done, a done-over-total bar from the todo list and team tasks, and the item in progress. It sits above Token Weather's band, shows "All done" for a few seconds when everything finishes, then hides.

## [0.1.0] - 2026-10-05

### Added

- Desktop replies drawn with the app's markdown and code views, alert cards, and themed full-width mermaid diagrams and charts with a zoomable Open large pane.
