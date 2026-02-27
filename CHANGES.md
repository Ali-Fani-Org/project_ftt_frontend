# Changelog

## 1.4.3 (2026-02-27)

- Fix: Use timezone-aware report filters (`start_date_after_tz` / `start_date_before_tz`) when loading report entries.
- Fix: Format report date range params in local date format to prevent UTC off-by-one day filtering issues.
- Fix: Align calendar heatmap monthly total hours with reports by summing raw entry durations.
- Chore: Capture JSON error payloads in Ky `beforeError` hooks for better downstream API error parsing.

## 1.4.2 (2025-02-26)

- Feat: Add Sentry/GlitchTip error tracking integration with environment-based DSN configuration
- Feat: Collect platform metadata (OS type, version, architecture) for Tauri desktop apps in Sentry
- Feat: Fetch and report user public IP for desktop apps via ipify.org
- Fix: Resolve oklch color format parsing error in chart gradients (TopTasksChart, TagDistributionChart, TimeTrendChart)
- Fix: Convert theme colors to RGB format using canvas for Chart.js compatibility
- Chore: Add PUBLIC_SENTRY_DSN environment variable support in GitHub Actions workflows
- Chore: Update sync-version.js to also update Cargo.lock file
- Chore: Add .env and .env.example for Sentry configuration

## 1.4.0 (2025-02-25)

- Feat: Add inline editing for time entry title and description on timer page
- Feat: Add inline editing for time entry title and description in detail modal
- Feat: Add 60-minute buffer feature for starting timers in the past
- Feat: Add slider and quick-select buttons for custom start time selection
- Feat: Add feature hint for buffer feature with dismissible notification
- Fix: Memory leak in timer interval cleanup on component unmount
- Refactor: Create reusable `editableEntry.ts` utility for edit state management
- Chore: Add `parseErrorResponse` utility for robust API error handling
- Chore: Update API types to support optional `start_time` parameter

## 1.0.2 (2025-11-16)

- Feat: Implement time entries viewing with cursor-based pagination
- Feat: Add option to display time entries in new window or modal dialog
- Feat: Add always-on-top toggle for time entries window
- Feat: Enhance title bar with Lucide icons and improved maximize/restore functionality
- Feat: Add logout confirmation dialog in settings
- Feat: Display app version in settings modal
- Chore: Bump project version to 1.0.1
- Chore: Add @lucide/svelte and @tauri-apps/plugin-dialog dependencies
- Chore: Update API documentation to reflect pagination changes
- Chore: Add version synchronization script

## 1.0.0 (2024-11-15)

- Feat: implement basic ci/cd config
