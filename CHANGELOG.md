# Changelog

All notable changes to this project will be documented in this file.

The version number follows [semantic versioning](https://semver.org/):
- **Major** — incompatible changes that require data migration or reconfiguration
- **Minor** — new features (backward compatible)
- **Patch** — bug fixes and small improvements (backward compatible)

## [1.3.0] — 2026-06-17

### Added
- Archive/hide projects from the dropdown without deleting their data — toggle via archive button in the config panel

## [1.2.0] — 2026-06-17

### Added
- Drag-and-drop reordering of projects in the config panel using a grip handle

## [1.1.2] — 2026-06-17

### Fixed
- Date column headers in the config panel now align with the input fields
- Date fields are wider to prevent truncation

### Changed
- Remove button replaced with a red trash can icon
- Project name column slightly narrower to give more room to date fields

## [1.1.1] — 2026-06-17

### Fixed
- Saving a project without an address now shows an error instead of silently dropping it
- Removing a project purges its data from the CSV
- Changing a project's address purges old data so the next collection fetches for the new location
- Upgrading no longer risks overwriting user data (documented in README)

## [1.1.0] — 2026-06-17

### Added
- Optional end date for projects — caps data collection when air conditioning is installed and running
- Print Report button with print-optimized single-page landscape layout (also works as Save as PDF)

### Changed
- Chart now filters data to the project's start/end date range
- Collecting data backfills gaps when the start date is moved earlier

## [1.0.0] — 2026-06-12

### Added
- EMC calculations using the validated Hailwood-Horrobin two-hydrate model (USDA FPL-GTR-282)
- Web server with in-browser project configuration
- Nominatim address picker with US-prioritized geocoding results
- Risk-tiered daily swing chart (Safe / Caution / High / Extreme)
- Explanatory info panel with EMC methodology and risk definitions
- CSV export with daily EMC, humidity, and temperature summaries
- Start scripts for Mac (`start.sh`) and Windows (`start.bat`)
- Automatic collection setup via cron (Mac) and Task Scheduler (Windows)
- Formula validation against USDA Wood Handbook Table 4-2 (`node validate.js`)
