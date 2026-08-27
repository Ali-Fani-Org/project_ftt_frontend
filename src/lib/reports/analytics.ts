/**
 * Pure analytics helpers for the Reports page.
 *
 * Everything here is framework-free so it can be unit tested without a Svelte
 * or TanStack Query runtime. Only `import type` references to `$lib/api` are
 * used — those are erased at compile time.
 */
import type { TimeEntry, Tag } from '$lib/api';

// ============================================================================
// Date & range utilities
// ============================================================================

export interface DateRange {
	start: string | null; // YYYY-MM-DD (local)
	end: string | null;
}

export interface RangeOptions {
	customStart?: string;
	customEnd?: string;
	/** Injectable "today" for deterministic tests. Defaults to `new Date()`. */
	now?: Date;
}

/** Weekday labels in the app's Saturday-first order (0 = Saturday). */
export const DAY_LABELS_SAT_FIRST = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

export function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * Resolve a named time range to concrete local dates. Ported verbatim from the
 * original reports page — including the intentional Saturday-first week logic
 * (`getDay()` Sunday=0 → Saturday=0).
 */
export function getTimeRangeDates(range: string, opts?: RangeOptions): DateRange {
	const now = opts?.now ?? new Date();
	let start: Date | null = null;
	let end: Date | null = null;

	switch (range) {
		case 'thisweek': {
			const dayOfWeekSat = (now.getDay() + 1) % 7; // Sunday=0 → Saturday=0
			start = new Date(now);
			start.setDate(now.getDate() - dayOfWeekSat);
			end = now;
			break;
		}
		case 'pastweek': {
			const dayOfWeekPast = (now.getDay() + 1) % 7;
			start = new Date(now);
			start.setDate(now.getDate() - dayOfWeekPast - 7);
			end = new Date(now);
			end.setDate(now.getDate() - dayOfWeekPast - 1);
			break;
		}
		case 'thismonth':
			start = new Date(now.getFullYear(), now.getMonth(), 1);
			end = now;
			break;
		case 'lastmonth':
			start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
			end = new Date(now.getFullYear(), now.getMonth(), 0);
			break;
		case 'last30days':
			start = new Date(now);
			start.setDate(now.getDate() - 30);
			end = now;
			break;
		case 'last7days':
			start = new Date(now);
			start.setDate(now.getDate() - 7);
			end = now;
			break;
		case 'yearly':
			start = new Date(now.getFullYear(), 0, 1);
			end = now;
			break;
		case 'custom':
			if (opts?.customStart && opts?.customEnd) {
				start = new Date(opts.customStart);
				end = new Date(opts.customEnd);
			}
			break;
		default:
			start = new Date(now);
			start.setDate(now.getDate() - 30);
			end = now;
	}

	return {
		start: start ? formatLocalDate(start) : null,
		end: end ? formatLocalDate(end) : null
	};
}

/**
 * Entries-page range resolver: maps the entries page's pill values onto the
 * shared Tehran-aware date logic. Kept pure (framework-free) so the entries
 * page's date behavior is unit-testable.
 *
 * Mapping:
 * - 'all'     → no date bounds
 * - 'custom'  → the user's custom start/end (both required)
 * - 'thisyear'→ the shared 'yearly' range
 * - everything else passes through to the shared named ranges
 */
export function resolveEntriesRange(range: string, opts?: RangeOptions): DateRange {
	if (range === 'all') return { start: null, end: null };
	if (range === 'custom') return getTimeRangeDates('custom', opts);
	const sharedRange = range === 'thisyear' ? 'yearly' : range;
	return getTimeRangeDates(sharedRange, opts);
}

/**
 * The equivalent window immediately before `range` — used for period-over-period
 * deltas. Semantics per range:
 * - thisweek → past week   · thismonth → last month · lastmonth → the month before that
 * - pastweek / last30days / yearly → the full previous equivalent window
 * - custom → same-length window ending the day before the custom start
 */
export function getPreviousRange(range: string, opts?: RangeOptions): DateRange {
	const current = getTimeRangeDates(range, opts);
	if (!current.start || !current.end) return { start: null, end: null };

	const startDate = new Date(current.start + 'T00:00:00');

	switch (range) {
		case 'thisweek':
			return getTimeRangeDates('pastweek', opts);
		case 'pastweek': {
			const start = new Date(startDate);
			start.setDate(start.getDate() - 7);
			const end = new Date(start);
			end.setDate(end.getDate() + 6);
			return { start: formatLocalDate(start), end: formatLocalDate(end) };
		}
		case 'thismonth':
			return getTimeRangeDates('lastmonth', opts);
		case 'lastmonth': {
			const ref = opts?.now ?? new Date();
			const start = new Date(ref.getFullYear(), ref.getMonth() - 2, 1);
			const end = new Date(ref.getFullYear(), ref.getMonth() - 1, 0);
			return { start: formatLocalDate(start), end: formatLocalDate(end) };
		}
		default: {
			// last30days / yearly / custom (and any unknown key): shift back by span length.
			const endDate = new Date(current.end + 'T23:59:59');
			const spanDays =
				Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
			const prevEnd = new Date(startDate);
			prevEnd.setDate(prevEnd.getDate() - 1);
			const prevStart = new Date(prevEnd);
			prevStart.setDate(prevStart.getDate() - (spanDays - 1));
			return { start: formatLocalDate(prevStart), end: formatLocalDate(prevEnd) };
		}
	}
}

const RANGE_DISPLAY: Record<string, string> = {
	thisweek: 'This Week',
	pastweek: 'Past Week',
	thismonth: 'This Month',
	lastmonth: 'Last Month',
	last30days: 'Last 30 Days',
	yearly: 'Yearly',
	custom: 'Custom Range'
};

export function getTimeRangeDisplay(range: string): string {
	return RANGE_DISPLAY[range] ?? 'This Month';
}

/** Pill-picker options for the header. */
export const TIME_RANGE_OPTIONS: { value: string; label: string }[] = [
	{ value: 'thisweek', label: 'Week' },
	{ value: 'pastweek', label: 'Last week' },
	{ value: 'thismonth', label: 'Month' },
	{ value: 'lastmonth', label: 'Last month' },
	{ value: 'last30days', label: '30 days' },
	{ value: 'yearly', label: 'Year' },
	{ value: 'custom', label: 'Custom' }
];

// ============================================================================
// Durations & deltas
// ============================================================================

/** Duration of an entry in seconds; live-computed for still-running entries. */
export function getEntryDurationSeconds(entry: TimeEntry, nowMs?: number): number {
	if (entry.duration) {
		return parseInt(entry.duration as string, 10) || 0;
	}
	if (entry.is_active) {
		return Math.max(
			0,
			Math.floor(((nowMs ?? Date.now()) - new Date(entry.start_time).getTime()) / 1000)
		);
	}
	return 0;
}

export function computeTotalSeconds(entries: TimeEntry[], nowMs?: number): number {
	return entries.reduce((sum, entry) => sum + getEntryDurationSeconds(entry, nowMs), 0);
}

export function formatDuration(seconds: number): string {
	if (isNaN(seconds) || seconds < 0) return '0h';
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (hours === 0) return `${minutes}m`;
	else if (minutes === 0) return `${hours}h`;
	else return `${hours}h ${minutes}m`;
}

export function toHours(seconds: number): number {
	return seconds > 0 ? +(seconds / 3600).toFixed(1) : 0;
}

/** Inclusive day count covered by a range (min 1). */
export function spanDays(range: DateRange): number {
	if (!range.start || !range.end) return 1;
	const start = new Date(range.start + 'T00:00:00').getTime();
	const end = new Date(range.end + 'T00:00:00').getTime();
	return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
}

export function avgDailySeconds(entries: TimeEntry[], range: DateRange, nowMs?: number): number {
	if (!entries.length) return 0;
	return Math.floor(computeTotalSeconds(entries, nowMs) / spanDays(range));
}

/**
 * Percentage change vs the previous period. Returns null when there is no
 * meaningful baseline (no previous data) so the UI can render an em-dash.
 */
export function percentDelta(current: number, previous: number | null | undefined): number | null {
	if (previous == null || !isFinite(previous) || previous <= 0) return null;
	if (!isFinite(current)) return null;
	return Math.round(((current - previous) / previous) * 100);
}

// ============================================================================
// Series aggregations
// ============================================================================

export interface SeriesDatum {
	name: string;
	totalSeconds: number;
	count: number;
}

/** Row shape consumed by the shared RankedBars list. */
export interface RankedItem {
	name: string;
	totalSeconds: number;
	count?: number;
	/** Optional per-item color (e.g. a live tag's color). Falls back to theme primary. */
	color?: string | null;
}

export interface DayOfWeekDatum extends SeriesDatum {
	avgSeconds: number;
}

/** Per-weekday totals, Saturday-first (index 0 = Saturday), matching DAY_LABELS_SAT_FIRST. */
export function dayOfWeekData(entries: TimeEntry[], nowMs?: number): DayOfWeekDatum[] {
	const totals = [0, 0, 0, 0, 0, 0, 0];
	const counts = [0, 0, 0, 0, 0, 0, 0];
	for (const entry of entries) {
		const day = (new Date(entry.start_time).getDay() + 1) % 7;
		totals[day] += getEntryDurationSeconds(entry, nowMs);
		counts[day]++;
	}
	return DAY_LABELS_SAT_FIRST.map((name, i) => ({
		name,
		totalSeconds: totals[i],
		count: counts[i],
		avgSeconds: counts[i] > 0 ? Math.floor(totals[i] / counts[i]) : 0
	}));
}

export interface HourDatum {
	hour: number;
	label: string;
	totalSeconds: number;
	count: number;
}

/** Per-hour-of-day totals across all entries (local hours). */
export function hourlyData(entries: TimeEntry[], nowMs?: number): HourDatum[] {
	const hours = Array.from({ length: 24 }, (_, hour) => ({
		hour,
		label: `${hour.toString().padStart(2, '0')}:00`,
		totalSeconds: 0,
		count: 0
	}));
	for (const entry of entries) {
		const hour = new Date(entry.start_time).getHours();
		hours[hour].totalSeconds += getEntryDurationSeconds(entry, nowMs);
		hours[hour].count++;
	}
	return hours;
}

export type GroupBy = 'name';

function groupTotals(
	entries: TimeEntry[],
	keyOf: (entry: TimeEntry) => string,
	nowMs?: number
): SeriesDatum[] {
	const map = new Map<string, { totalSeconds: number; count: number }>();
	for (const entry of entries) {
		const key = keyOf(entry);
		const existing = map.get(key) ?? { totalSeconds: 0, count: 0 };
		existing.totalSeconds += getEntryDurationSeconds(entry, nowMs);
		existing.count++;
		map.set(key, existing);
	}
	return Array.from(map.entries())
		.map(([name, agg]) => ({ name, ...agg }))
		.sort((a, b) => b.totalSeconds - a.totalSeconds);
}

export function projectData(entries: TimeEntry[], nowMs?: number): SeriesDatum[] {
	return groupTotals(entries, (entry) => entry.project || 'No Project', nowMs);
}

export function topTasksData(entries: TimeEntry[], limit = 8, nowMs?: number): SeriesDatum[] {
	return groupTotals(entries, (entry) => entry.title.trim() || '(untitled)', nowMs).slice(0, limit);
}

export interface TagDatum extends SeriesDatum {
	tag: Tag | null;
	color: string | null;
}

/**
 * Aggregate time by tag, preserving each tag's live object (id/title/icon/color)
 * where available. Tolerates legacy cached pages whose persisted payload still
 * contains plain-string tags. Grouped by tag id so two tags sharing a title stay
 * separate; keyed output is sorted by total seconds descending.
 */
export function tagsData(entries: TimeEntry[], limit = 10, nowMs?: number): TagDatum[] {
	interface Agg extends TagDatum {
		key: string;
	}
	const map = new Map<string, Agg>();
	for (const entry of entries) {
		const seconds = getEntryDurationSeconds(entry, nowMs);
		for (const raw of (entry.tags ?? []) as (Tag | string)[]) {
			const isObject = typeof raw === 'object' && raw !== null;
			const name = isObject
				? ((raw as Tag).title ?? (raw as Tag).tag ?? String(raw.id))
				: String(raw);
			const key = isObject ? `id:${(raw as Tag).id}` : `s:${name}`;
			const color = isObject ? ((raw as Tag).color ?? null) : null;
			const existing = map.get(key);
			if (existing) {
				existing.totalSeconds += seconds;
				existing.count++;
				if (!existing.color && color) existing.color = color;
				if (!existing.tag && isObject) existing.tag = raw as Tag;
			} else {
				map.set(key, {
					key,
					name,
					color,
					totalSeconds: seconds,
					count: 1,
					tag: isObject ? (raw as Tag) : null
				});
			}
		}
	}
	return Array.from(map.values())
		.sort((a, b) => b.totalSeconds - a.totalSeconds)
		.slice(0, limit)
		.map(({ key: _key, ...rest }) => rest);
}

// ============================================================================
// Trend series (hero chart buckets)
// ============================================================================

export type BucketUnit = 'day' | 'week' | 'month';

/** ≤92 days → daily bars; ≤ 2 years → weekly; otherwise monthly. */
export function chooseBucketUnit(range: DateRange): BucketUnit {
	const days = spanDays(range);
	if (days <= 92) return 'day';
	if (days <= 730) return 'week';
	return 'month';
}

export interface TrendBucket {
	label: string;
	fullLabel: string; // tooltip-level detail, e.g. "Mar 4, 2026"
	startISO: string; // YYYY-MM-DD of bucket start
	totalSeconds: number;
}

interface BucketFrame {
	label: string;
	fullLabel: string;
	startISO: string;
	startTime: number;
	endTime: number; // inclusive
	index: number;
}

const MONTH_NAMES_SHORT = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

function buildFrames(unit: BucketUnit, range: DateRange): BucketFrame[] {
	if (!range.start || !range.end) return [];
	const startTime = new Date(range.start + 'T00:00:00').getTime();
	const endTime = new Date(range.end + 'T00:00:00').getTime();
	const frames: BucketFrame[] = [];

	if (unit === 'day') {
		const cursor = new Date(startTime);
		while (cursor.getTime() <= endTime) {
			frames.push({
				label: `${MONTH_NAMES_SHORT[cursor.getMonth()]} ${cursor.getDate()}`,
				fullLabel: cursor.toLocaleDateString(undefined, {
					weekday: 'short',
					year: 'numeric',
					month: 'short',
					day: 'numeric'
				}),
				startISO: formatLocalDate(cursor),
				startTime: cursor.getTime(),
				endTime: cursor.getTime() + (1000 * 60 * 60 * 24 - 1),
				index: frames.length
			});
			cursor.setDate(cursor.getDate() + 1);
		}
		return frames;
	}

	if (unit === 'week') {
		// Saturday-start weeks, clipped to the selected range (same convention as
		// every other aggregation on this page).
		const cursor = new Date(startTime);
		const offsetToSaturday = (cursor.getDay() + 1) % 7;
		cursor.setDate(cursor.getDate() - offsetToSaturday);
		while (cursor.getTime() <= endTime) {
			const weekStart = new Date(cursor);
			const weekEnd = new Date(cursor);
			weekEnd.setDate(weekEnd.getDate() + 6);
			frames.push({
				label: `${MONTH_NAMES_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}`,
				fullLabel: `${formatLocalDate(weekStart)} – ${formatLocalDate(weekEnd)}`,
				startISO: formatLocalDate(weekStart),
				startTime: Math.max(weekStart.getTime(), startTime),
				endTime: Math.min(
					weekEnd.getTime() + (1000 * 60 * 60 * 24 - 1),
					endTime + (1000 * 60 * 60 * 24 - 1)
				),
				index: frames.length
			});
			cursor.setDate(cursor.getDate() + 7);
		}
		return frames;
	}

	// month: first-of-month to month end (or range edges)
	const cursor = new Date(startTime);
	cursor.setDate(1);
	while (cursor.getTime() <= endTime) {
		const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
		const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
		frames.push({
			label: MONTH_NAMES_SHORT[monthStart.getMonth()],
			fullLabel: monthStart.toLocaleDateString(undefined, { year: 'numeric', month: 'long' }),
			startISO: formatLocalDate(monthStart),
			startTime: Math.max(monthStart.getTime(), startTime),
			endTime: Math.min(
				monthEnd.getTime() + (1000 * 60 * 60 * 24 - 1),
				endTime + (1000 * 60 * 60 * 24 - 1)
			),
			index: frames.length
		});
		cursor.setMonth(cursor.getMonth() + 1);
	}
	return frames;
}

/**
 * Zero-filled trend series over the whole selected range. Every bucket exists
 * even with no entries, so chart x-axes remain stable while data loads or when
 * only some days have activity.
 */
export function trendSeries(
	entries: TimeEntry[],
	range: DateRange,
	unitOverride?: BucketUnit,
	nowMs?: number
): { unit: BucketUnit; buckets: TrendBucket[] } {
	const unit = unitOverride ?? chooseBucketUnit(range);
	const frames = buildFrames(unit, range);
	const totals = frames.map(() => 0);

	if (frames.length) {
		// Bucket sizes are small (≤ ~92 daily / ~105 weekly / ≤24 monthly frames),
		// so a linear scan per entry stays well under a millisecond for page-sized
		// datasets and handles irregular week/month boundaries uniformly.
		for (const entry of entries) {
			const at = new Date(entry.start_time).getTime();
			const seconds = getEntryDurationSeconds(entry, nowMs);
			if (seconds === 0) continue;
			const index = frames.findIndex((f) => at >= f.startTime && at <= f.endTime);
			if (index >= 0) totals[index] += seconds;
		}
	}

	return {
		unit,
		buckets: frames.map((f, i) => ({
			label: f.label,
			fullLabel: f.fullLabel,
			startISO: f.startISO,
			totalSeconds: totals[i]
		}))
	};
}

// ============================================================================
// Heatmap matrix (weekday × hour punchcard)
// ============================================================================

export interface HeatmapMatrix {
	/** values[weekdayIndex][hour] — weekday index matches DAY_LABELS_SAT_FIRST. */
	values: number[][];
	maxSeconds: number;
	totalSeconds: number;
}

export function heatmapMatrix(entries: TimeEntry[], nowMs?: number): HeatmapMatrix {
	const values: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
	let max = 0;
	let total = 0;

	for (const entry of entries) {
		const startedAt = new Date(entry.start_time);
		const day = (startedAt.getDay() + 1) % 7;
		const hour = startedAt.getHours();
		values[day][hour] += getEntryDurationSeconds(entry, nowMs);
	}

	for (const row of values) {
		for (const cell of row) {
			if (cell > max) max = cell;
			total += cell;
		}
	}

	return { values, maxSeconds: max, totalSeconds: total };
}

// ============================================================================
// Theme color resolution (client-only, SSR-safe)
// ============================================================================

/** Resolved daisyUI primary color for canvas/SVG fills, e.g. "oklch(...)". */
export function resolvePrimaryColor(): string {
	if (typeof document === 'undefined') return 'oklch(0.55 0.2 262)';
	const p = getComputedStyle(document.documentElement).getPropertyValue('--p').trim();
	return p ? `oklch(${p})` : 'oklch(0.55 0.2 262)';
}

/**
 * Same primary as "R, G, B" (via canvas conversion) so components can build
 * rgba()/alpha tints that follow the active theme, including user themes.
 */
export function resolvePrimaryRgb(): string {
	if (typeof document === 'undefined') return '59, 130, 246';
	try {
		const probe = document.createElement('div');
		probe.className = 'bg-primary';
		probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;';
		document.body.appendChild(probe);
		const computed = getComputedStyle(probe).backgroundColor;
		document.body.removeChild(probe);

		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const ctx = canvas.getContext('2d');
		if (!ctx) return '59, 130, 246';
		ctx.fillStyle = computed;
		ctx.fillRect(0, 0, 1, 1);
		const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
		return `${r}, ${g}, ${b}`;
	} catch {
		return '59, 130, 246';
	}
}
