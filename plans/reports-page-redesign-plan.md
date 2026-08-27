# Reports Page Redesign Plan — "Insights Dashboard"

> **Status:** ✅ Implemented (2026-08-27). All steps shipped; typecheck clean, build passes, 36/36 analytics unit tests green.
> **Scope:** Frontend only — `src/routes/reports/+page.svelte` and `$lib/reports/*`.
> **Constraints:** No new dependencies. No backend changes. All colors via daisyUI theme tokens so the `web3hub` theme and user custom themes keep working.

---

## 1. Background

The reports page (`src/routes/reports/+page.svelte`) currently renders, top to bottom:

1. Header (icon + title + total-hours badge)
2. Filter card with one `<select>` for time range (+ custom date inputs)
3. Trends section: `TimeTrendChart.svelte` (Chart.js) + hand-rolled div-bar "Time by Day" chart
4. Five KPI cards: Total Time, Daily Average, Top Project, Best Day, Peak Hour
5. Breakdown: `TopTasksChart.svelte` + project progress bars (div-based)
6. Time Patterns: hourly + weekly bar charts via `TanStackChart.svelte` (@tanstack/charts)
7. Tags: horizontal `barX` chart
8. Recent Activity: plain daisyUI table of 15 entries

### Design critique (why redesign)

| # | Problem | Fix |
|---|---------|-----|
| 1 | KPI stats sit **below** charts; reading order is backwards | Stat strip moves above all charts |
| 2 | Long flat scroll — 4 similar stacked sections, no anchor | Bento grid with clear hierarchy |
| 3 | **Three** chart systems mixed (Chart.js, div bars, TanStack) | Unify on TanStack Charts |
| 4 | Numbers lack context ("42h… good or bad?") | Period-over-period delta badges |
| 5 | Full-width card wrapping a single `<select>` | Compact segmented pill picker in header |
| 6 | One global spinner; weak zero-data screens | Per-region skeletons, friendly empty states |
| 7 | Weekly-trend mini-chart duplicates the daily trend | Dropped (superseded by hero chart bucketing) |

### Approved decisions (user choices)

- **Ambition:** Bold overhaul — bento-style dashboard grid, unified chart system, stat strip, micro-interactions.
- **New widgets:** Period-over-period deltas ✔, Weekday × hour heatmap ✔, Polished empty/loading states ✔.

---

## 2. Target layout

```
DESKTOP (≥1280px)
╔══════════════════════════════════════════════════════════════════╗
║  ◫ REPORTS                                                        ║
║  Where your hours go — This Month       [●offline badge if any]   ║
║                                       ┌───────────────────────┐  ║
║                                       │ Pills: Wk|Mo|30d|Year|Custom ║
║                                       └───────────────────────┘  ║
╠══════════════════════════════════════════════════════════════════╣
║ STAT STRIP — 5 tiles, numbers-first                               ║
║ ┏━━━━━━━━━━┓ ┏━━━━━━━━━━┓ ┏━━━━━━━━━━┓ ┏━━━━━━━━━━┓ ┏━━━━━━━━━━┓  ║
║ ┃ ⊙ TOTAL  ┃ ┃ ◎ DAILY  ┃ ┃ ▣ TOP    ┃ ┃ ✦ BEST   ┃ ┃ ⚡ PEAK  ┃  ║
║ ┃ 42h 18m  ┃ ┃ 1.8h/day ┃ ┃ PROJECT  ┃ ┃ DAY      ┃ ┃ HOUR     ┃  ║
║ ┃ ▲ 12% ↗  ┃ ┃ ▲ 4%     ┃ ┃ Acme     ┃ ┃ Tuesday  ┃ ┃ 14:00–15 ┃  ║
║ ┃ vs prior ┃ ┃ vs prior ┃ ┃ 16.2h·38%┃ ┃ 9h 10m   ┃ ┃          ┃  ║
║ ┗━━━━━━━━━━┛ ┗━━━━━━━━━━┛ ┗━━━━━━━━━━┛ ┗━━━━━━━━━━┛ ┗━━━━━━━━━━┛  ║
╠══════════════════════════════════════════════════════════════════╣
║ BENTO ROW 1                                                       ║
║ ┌─────────────────────────────────────┐ ┌──────────────────────┐ ║
║ │ ACTIVITY TREND        [Bars|Area]   │ │ BY PROJECT           │ ║
║ │                                     │ │ Acme  ████████ 38%   │ ║
║ │   ▂▄▆█▅▃▁▂▄▆▇▅▃▂▄▆                  │ │ Beta  █████    22%   │ ║
║ │   day / week / month bucketed       │ │ Gamm  ███      15%   │ ║
║ │   x-axis: date range caption        │ │ …animated ranked bars│ ║
║ └─────────────────────────────────────┘ │  + share-of-total %  │ ║
║                                         └──────────────────────┘ ║
║ BENTO ROW 2                                                       ║
║ ┌─────────────────────────────────────┐ ┌──────────────────────┐ ║
║ │ WORK RHYTHM — weekday × hour        │ │ TOP TASKS            │ ║
║ │       Su Mo Tu We Th Fr Sa          │ │ API fix   ▇▇▇▇▇ 6.2h │ ║
║ │  00h   ░ ░ ░ ▒ ▒ ░ ░                │ │ Design…   ▇▇▇   4.8h │ ║
║ │  08h   ░ ▒ █ █ ▓ ▒ ░                │ │ (unified horizontal│ ║
║ │  14h   ░ ▓ █ ▓ ▒ ░ ░                │ │  TanStack barX)   │ ║
║ │  legend  less ▢▨▧▩ more             │ │                      │ ║
║ └─────────────────────────────────────┘ └──────────────────────┘ ║
║ BENTO ROW 3                                                       ║
║ ┌──────────────────────────────────────────────────────────────┐ ║
║ │ TOP TAGS — horizontal TanStack bars (existing, restyled)     │ ║
║ └──────────────────────────────────────────────────────────────┘ ║
║ RECENT ACTIVITY — refined table: project color-dot, tag chips,   ║
║ monospaced tabular durations, subtle row hover, density tuned    ║
╚══════════════════════════════════════════════════════════════════╝

MOBILE (<640px): pills become a horizontally-scrollable row;
stat strip = horizontal snap-carousel showing ~2.2 tiles;
every bento card stacks single-column; table → sticky header + h-scroll.

DETAIL — stat tile with delta                 DETAIL — custom range
┌──────────────────┐                          Pills: [Wk|Mo|30d|Yr|Custom]
│ ⊙ TOTAL TIME     │                          Choosing Custom reveals ↓
│                  │                          ┌── pop-up panel ────┐
│   42h 18m        │ ← xl tabular-nums        │ From ▢▢▢  To ▢▢▢   │
│  ▲ +12% vs prev  │ ← success/error token    │         [ Apply ]  │
│ ▬▬▬▬▬▬▬ micro    │                          └────────────────────┘
│ ▬▬ bar vs prior  │   arrow ▲▼ horizontal
└──────────────────┘   bar comparison
```

---

## 3. Key UX decisions

1. **Stats first (inverted pyramid).** Stat strip above charts. Delta badges answer "good?" instantly — computed by fetching the equivalent **previous period** through the same endpoint/filter machinery (`useFilteredTimeEntries`) and comparing totals.
2. **One chart system.** Rebuild Chart.js `TimeTrendChart` and the div-bar day chart on **TanStack Charts** (`defineChart`, `barY`/`barX`, already used for hourly/weekly/tags). Visual drift between cards disappears.
3. **Weekday × hour heatmap replaces BOTH "Time by Day" AND standalone "Time by Hour" charts** — the punchcard encodes both dimensions, removing two redundant cards. Build as CSS grid with alpha-tinted theme primary; mirror the technique of existing `src/lib/CalendarHeatmap.svelte`.
4. **Drop the Weekly Trend mini-chart** — fully superseded by the hero trend's automatic bucketing (daily → weekly/monthly buckets for long ranges).
5. **Compact segmented-pill range picker in the header** replaces the filter card. Custom opens an inline date pair + Apply button. Keep the offline "showing cached data" badge in the filter row.
6. **Real states everywhere:** per-region skeleton loaders (daisyUI `skeleton`), friendly zero-data screens (icon + copy, CTA toward `/timer` where relevant), error alert with Retry button, existing offline badge preserved.

---

## 4. Changes by file

| File | Change |
|---|---|
| `src/lib/reports/analytics.ts` | **NEW** — extract pure aggregation fns out of `+page.svelte`: `getEntryDurationSeconds`, daily-bucket builder, `dayOfWeekData`, `hourlyData`, `projectData`, `tagsData`, heatmap matrix builder, prev-range calculator (`getPrevRange`), delta formatting helper. Pure/testable. |
| `src/lib/reports/DailyActivityChart.svelte` | **NEW** — TanStack hero chart. Bars/Area toggle. Smart bucketing: ≤92 days → daily bars; longer → weekly/monthly aggregation. Theme primary via resolved `--p` oklch value. |
| `src/lib/reports/PunchcardHeatmap.svelte` | **NEW** — weekday × hour CSS-grid heatmap (7 rows × 24 cols), intensity from duration share, `title` tooltips, less→more legend, aria-label per cell. |
| `src/lib/reports/TanStackChart.svelte` | Unchanged thin wrapper around `@tanstack/charts/svelte`. |
| `src/lib/reports/RankedBars.svelte` (optional) | Shared animated ranked-bar list used by Top Tasks (and possibly Tags) so styling is identical. |
| `src/routes/reports/+page.svelte` | Full restructure: header + pill picker → stat strip w/ skeletons & deltas → bento grid → refined table. Delete Chart.js import and all div-bar markup. Wire second query for previous-period data. |
| `src/lib/reports/TimeTrendChart.svelte` | **DELETE** after replacement. |
| `src/lib/__tests__/reports-analytics.spec.ts` | Unit tests for `analytics.ts` helpers (mirrors existing `src/lib/__tests__` setup — check which runner is configured before writing). |

### Technical notes for implementer

- Filter state machine stays the same ranges: `thisweek | pastweek | thismonth | lastmonth | last30days | yearly | custom` (Sat-first week logic in current `getTimeRangeDates` is intentional — keep behavior).
- Time entries come from `useFilteredTimeEntries(filtersGetter, options)` (TanStack Query wrapper in `$lib/queries/timeEntries.ts`); TZ-aware params are `start_date_after_tz` / `start_date_before_tz`. Query keys change when the getter output changes → automatic refetch. Previous-period query = same call, different date window.
- Duration field: `entry.duration` is a string of seconds; active entries have `duration == null && is_active` → compute live from `start_time`. Centralize this once in `analytics.ts`.
- Theme-aware chart color: reuse the `resolvePrimaryColor()` trick from the current page — read computed `--p` CSS var as oklch from a temp element, convert via canvas if needed. Extract into `analytics.ts` or a small shared util so heatmap + charts share one implementation.
- Everything must derive from daisyUI tokens (`bg-base-100`, `text-primary`, alpha classes) — never hardcoded hex — because the app supports user-defined themes via stores/customThemes.

---

## 5. Implementation order

1. **Extract aggregations** into `src/lib/reports/analytics.ts` (+ unit tests) with zero behavior change; slim `+page.svelte` imports.
2. **Build `DailyActivityChart`** (TanStack) with Bars/Area toggle + smart bucketing; delete Chart.js `TimeTrendChart.svelte`.
3. **Build `PunchcardHeatmap`**.
4. **Restructure `+page.svelte`:** header/pill picker → stat strip with skeletons/deltas (previous-period query) → bento grid → refined recent-activity table.
5. **States polish:** per-region skeletons, empty screens, retry-on-error, `prefers-reduced-motion` respect, focus-visible styles on pills, `tabular-nums`, truncation with `title` fallbacks.
6. **Verify:** typecheck/build (`svelte-check` / project build script), run analytics unit tests, dev-server visual review at desktop + mobile widths.

## 6. Acceptance checklist

- [ ] No Chart.js import remains on the reports route
- [ ] Stats render above all charts, with ▲/▼ deltas on Total Time & Daily Average
- [ ] Heatmap renders weekday × hour grid with legend, correct under light + dark + a user custom theme
- [ ] Range switcher includes Custom with working date pair + Apply
- [ ] Skeletons show during pending; empty states on zero entries; Retry on failure
- [ ] Mobile: single column stack, horizontally scrollable pills & stat carousel, usable table
- [ ] Unit tests for `analytics.ts` pass; build/typecheck clean
- [ ] Offline cached-data badge still appears when applicable
