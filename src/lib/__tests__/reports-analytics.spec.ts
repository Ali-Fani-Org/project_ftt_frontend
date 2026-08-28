import { describe, expect, it } from 'vitest';
import {
	avgDailySeconds,
	chooseBucketUnit,
	computeTotalSeconds,
	dayOfWeekData,
	dayOfWeekFromAggregates,
	formatDuration,
	getEntryDurationSeconds,
	getPreviousRange,
	getTimeRangeDates,
	resolveEntriesRange,
	heatmapFromValues,
	heatmapMatrix,
	hourlyFromAggregates,
	hourlyData,
	percentDelta,
	projectData,
	spanDays,
	tagsData,
	topTasksData,
	trendSeries,
	trendSeriesFromDaily,
	type DateRange
} from '../reports/analytics';
import type { TimeEntry, Tag } from '$lib/api';

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

const SATURDAY_NOON = new Date('2026-08-15T12:00:00'); // 2026-08-15 is a Saturday

function makeTag(partial: Partial<Tag>): Tag {
	return {
		id: 1,
		title: 'Tag',
		tag: 'tag',
		icon: 'tag',
		color: '#22c55e',
		created_at: '2026-01-01T00:00:00Z',
		...partial
	};
}

function makeEntry(partial: Partial<TimeEntry>): TimeEntry {
	return {
		id: 1,
		title: 'Task',
		description: '',
		start_time: '2026-08-15T12:00:00',
		end_time: null,
		duration: '3600',
		is_active: false,
		user: '',
		project: 'Acme',
		tags: [],
		...partial
	};
}

const NOW_OPTS = { now: SATURDAY_NOON };

// -----------------------------------------------------------------------------
// Durations & formatting
// -----------------------------------------------------------------------------

describe('getEntryDurationSeconds', () => {
	it('parses the duration string', () => {
		expect(getEntryDurationSeconds(makeEntry({ duration: '8526.0' }))).toBe(8526);
	});

	it('computes live duration for active entries', () => {
		const start = new Date(SATURDAY_NOON.getTime() - 10 * 60_000).toISOString();
		const entry = makeEntry({ duration: null, is_active: true, start_time: start });
		expect(getEntryDurationSeconds(entry, SATURDAY_NOON.getTime())).toBe(600);
	});

	it('returns 0 for completed entries without duration', () => {
		expect(getEntryDurationSeconds(makeEntry({ duration: null, is_active: false }))).toBe(0);
	});
});

describe('formatDuration', () => {
	it('formats hours and minutes', () => {
		expect(formatDuration(3660)).toBe('1h 1m');
	});
	it('drops zero minutes and zero hours', () => {
		expect(formatDuration(7200)).toBe('2h');
		expect(formatDuration(300)).toBe('5m');
	});
	it('handles junk input', () => {
		expect(formatDuration(NaN)).toBe('0h');
		expect(formatDuration(-5)).toBe('0h');
	});
});

describe('percentDelta', () => {
	it('computes rounded percentage change', () => {
		expect(percentDelta(112, 100)).toBe(12);
		expect(percentDelta(88, 100)).toBe(-12);
	});
	it('returns null without a baseline', () => {
		expect(percentDelta(100, null)).toBeNull();
		expect(percentDelta(100, 0)).toBeNull();
		expect(percentDelta(100, undefined)).toBeNull();
	});
});

// -----------------------------------------------------------------------------
// Ranges
// -----------------------------------------------------------------------------

describe('getTimeRangeDates', () => {
	it('uses Saturday-first weeks', () => {
		// Wed 2026-08-19 belongs to the week starting Sat 2026-08-15.
		const wed = new Date('2026-08-19T10:00:00');
		const range = getTimeRangeDates('thisweek', { now: wed });
		expect(range.start).toBe('2026-08-15');
		expect(range.end).toBe('2026-08-19');
	});

	it('computes past week boundaries', () => {
		const range = getTimeRangeDates('pastweek', NOW_OPTS);
		expect(range.start).toBe('2026-08-08'); // full Sat–Fri week before "now"
		expect(range.end).toBe('2026-08-14');
	});

	it('computes month boundaries', () => {
		expect(getTimeRangeDates('thismonth', NOW_OPTS)).toEqual({
			start: '2026-08-01',
			end: '2026-08-15'
		});
		expect(getTimeRangeDates('lastmonth', NOW_OPTS)).toEqual({
			start: '2026-07-01',
			end: '2026-07-31'
		});
	});

	it('computes last 30 days and yearly', () => {
		expect(getTimeRangeDates('last30days', NOW_OPTS)).toEqual({
			start: '2026-07-16',
			end: '2026-08-15'
		});
		expect(getTimeRangeDates('yearly', NOW_OPTS)).toEqual({
			start: '2026-01-01',
			end: '2026-08-15'
		});
	});

	it('computes last 7 days', () => {
		expect(getTimeRangeDates('last7days', NOW_OPTS)).toEqual({
			start: '2026-08-08',
			end: '2026-08-15'
		});
	});

	it('uses the LOCAL date, not the UTC date, at edge hours (Tehran UTC+3:30)', () => {
		// 2026-08-26T21:00:00Z is 2026-08-27 00:30 in Asia/Tehran — the local day
		// has already rolled over even though UTC is still the 26th. A naive
		// toISOString().split('T')[0] would yield '2026-08-26' and silently drop
		// the current Tehran day from every range ending "today".
		const edgeHour = new Date('2026-08-26T21:00:00Z');
		const range = getTimeRangeDates('last7days', { now: edgeHour });
		expect(range.end).toBe('2026-08-27');
		expect(range.end).not.toBe('2026-08-26');
	});

	it('respects custom dates only when both are set', () => {
		expect(
			getTimeRangeDates('custom', {
				...NOW_OPTS,
				customStart: '2026-02-01',
				customEnd: '2026-02-20'
			})
		).toEqual({ start: '2026-02-01', end: '2026-02-20' });
		expect(getTimeRangeDates('custom', { ...NOW_OPTS, customStart: '2026-02-01' })).toEqual({
			start: null,
			end: null
		});
	});
});

describe('resolveEntriesRange (entries-page pill mapping)', () => {
	it('maps "all" to no date bounds', () => {
		expect(resolveEntriesRange('all', NOW_OPTS)).toEqual({ start: null, end: null });
	});

	it('passes through shared named ranges unchanged', () => {
		expect(resolveEntriesRange('last7days', NOW_OPTS)).toEqual(
			getTimeRangeDates('last7days', NOW_OPTS)
		);
		expect(resolveEntriesRange('thisweek', NOW_OPTS)).toEqual(
			getTimeRangeDates('thisweek', NOW_OPTS)
		);
		expect(resolveEntriesRange('thismonth', NOW_OPTS)).toEqual(
			getTimeRangeDates('thismonth', NOW_OPTS)
		);
	});

	it('maps "thisyear" to the shared yearly range', () => {
		expect(resolveEntriesRange('thisyear', NOW_OPTS)).toEqual({
			start: '2026-01-01',
			end: '2026-08-15'
		});
	});

	it('forwards custom dates and requires both to be set', () => {
		expect(
			resolveEntriesRange('custom', {
				customStart: '2026-02-01',
				customEnd: '2026-02-20'
			})
		).toEqual({ start: '2026-02-01', end: '2026-02-20' });
		expect(resolveEntriesRange('custom', { customStart: '2026-02-01' })).toEqual({
			start: null,
			end: null
		});
	});

	it('resolves the full week across a Saturday boundary', () => {
		// Sunday 2026-08-16 belongs to the week starting Saturday 2026-08-15.
		const sunday = new Date('2026-08-16T12:00:00');
		expect(resolveEntriesRange('thisweek', { now: sunday })).toEqual({
			start: '2026-08-15',
			end: '2026-08-16'
		});
	});
});

describe('getPreviousRange', () => {
	it('maps thisweek → pastweek', () => {
		expect(getPreviousRange('thisweek', NOW_OPTS)).toEqual(getTimeRangeDates('pastweek', NOW_OPTS));
	});

	it('maps thismonth → lastmonth', () => {
		expect(getPreviousRange('thismonth', NOW_OPTS)).toEqual(
			getTimeRangeDates('lastmonth', NOW_OPTS)
		);
	});

	it('shifts lastmonth back one more month', () => {
		expect(getPreviousRange('lastmonth', NOW_OPTS)).toEqual({
			start: '2026-06-01',
			end: '2026-06-30'
		});
	});

	it('shifts pastweek back seven days', () => {
		expect(getPreviousRange('pastweek', NOW_OPTS)).toEqual({
			start: '2026-08-01',
			end: '2026-08-07'
		});
	});

	it('shifts custom ranges by their span', () => {
		const opts = { ...NOW_OPTS, customStart: '2026-02-01', customEnd: '2026-02-10' };
		expect(getPreviousRange('custom', opts)).toEqual({ start: '2026-01-22', end: '2026-01-31' });
	});
});

describe('spanDays', () => {
	it('counts inclusive days', () => {
		const range: DateRange = { start: '2026-08-01', end: '2026-08-07' };
		expect(spanDays(range)).toBe(7);
	});
	it('falls back to 1 for open ranges', () => {
		expect(spanDays({ start: null, end: null })).toBe(1);
	});
});

// -----------------------------------------------------------------------------
// Aggregations
// -----------------------------------------------------------------------------

describe('computeTotalSeconds / avgDailySeconds', () => {
	it('sums entry durations', () => {
		const entries = [makeEntry({ duration: '3600' }), makeEntry({ duration: '1800' })];
		expect(computeTotalSeconds(entries)).toBe(5400);
	});

	it('averages over the inclusive range span', () => {
		const entries = [makeEntry({ duration: '7200' })];
		const range: DateRange = { start: '2026-08-01', end: '2026-08-07' };
		expect(avgDailySeconds(entries, range)).toBe(Math.floor(7200 / 7));
	});
});

describe('series aggregations', () => {
	const entries = [
		makeEntry({
			id: 1,
			title: 'API fix',
			project: 'Acme',
			duration: '3600',
			start_time: '2026-08-15T09:00:00'
		}),
		makeEntry({
			id: 2,
			title: 'API fix',
			project: 'Acme',
			duration: '7200',
			start_time: '2026-08-16T10:00:00'
		}),
		makeEntry({
			id: 3,
			title: 'Design',
			project: 'Beta',
			duration: '1800',
			start_time: '2026-08-17T11:00:00'
		})
	];

	it('ranks projects by total seconds', () => {
		const data = projectData(entries);
		expect(data[0]).toMatchObject({ name: 'Acme', totalSeconds: 10800, count: 2 });
		expect(data[1]).toMatchObject({ name: 'Beta', totalSeconds: 1800, count: 1 });
	});

	it('groups top tasks by title with a limit', () => {
		const data = topTasksData(entries, 1);
		expect(data).toHaveLength(1);
		expect(data[0]).toMatchObject({ name: 'API fix', totalSeconds: 10800 });
	});

	it('aggregates weekday totals Saturday-first', () => {
		const data = dayOfWeekData(entries);
		// 2026-08-15 Sat, 08-16 Sun, 08-17 Mon
		expect(data[0]).toMatchObject({ name: 'Sat', totalSeconds: 3600 });
		expect(data[1]).toMatchObject({ name: 'Sun', totalSeconds: 7200 });
		expect(data[2]).toMatchObject({ name: 'Mon', totalSeconds: 1800 });
		expect(data[5]).toMatchObject({ name: 'Thu', totalSeconds: 0 });
	});

	it('buckets by local hour', () => {
		const data = hourlyData(entries);
		expect(data[9]).toMatchObject({ hour: 9, totalSeconds: 3600 });
		expect(data[10].totalSeconds).toBe(7200);
		expect(data[11]).toMatchObject({ hour: 11, totalSeconds: 1800 });
	});
});

// -----------------------------------------------------------------------------
// Live tags
// -----------------------------------------------------------------------------

describe('tagsData', () => {
	it('groups by live tag id and keeps color/title', () => {
		const work = makeTag({ id: 1, title: 'work', color: '#3b82f6' });
		const focus = makeTag({ id: 2, title: 'focus', color: '#f59e0b' });
		const entries = [
			makeEntry({ duration: '3600', tags: [work] }),
			makeEntry({ duration: '7200', tags: [work, focus] })
		];
		const data = tagsData(entries);
		expect(data).toHaveLength(2);
		expect(data[0]).toMatchObject({ name: 'work', totalSeconds: 10800, color: '#3b82f6' });
		expect(data[0].tag?.id).toBe(1);
		expect(data[1]).toMatchObject({ name: 'focus', totalSeconds: 7200, color: '#f59e0b' });
	});

	it('keeps same-title tags with different ids separate', () => {
		const a = makeTag({ id: 1, title: 'deep' });
		const b = makeTag({ id: 2, title: 'deep' });
		const data = tagsData([
			makeEntry({ duration: '60', tags: [a] }),
			makeEntry({ duration: '120', tags: [b] })
		]);
		expect(data).toHaveLength(2);
		expect(data.map((d) => d.totalSeconds).sort((x, y) => x - y)).toEqual([60, 120]);
	});

	it('tolerates legacy string tags from persisted caches', () => {
		const data = tagsData([makeEntry({ duration: '600', tags: ['legacy' as unknown as Tag] })]);
		expect(data[0]).toMatchObject({ name: 'legacy', totalSeconds: 600, color: null, tag: null });
	});

	it('respects the limit', () => {
		const many = Array.from({ length: 15 }, (_, i) => makeTag({ id: i + 1, title: `t${i}` }));
		const entries = [makeEntry({ duration: '60', tags: many })];
		expect(tagsData(entries, 10)).toHaveLength(10);
	});
});

// -----------------------------------------------------------------------------
// Trend buckets
// -----------------------------------------------------------------------------

describe('chooseBucketUnit', () => {
	it('uses days for short ranges and weeks/months for long ones', () => {
		expect(chooseBucketUnit({ start: '2026-01-01', end: '2026-04-02' })).toBe('day'); // exactly 92d
		expect(chooseBucketUnit({ start: '2026-01-01', end: '2026-04-03' })).toBe('week'); // 93d
		expect(chooseBucketUnit({ start: '2024-01-01', end: '2026-01-01' })).toBe('month'); // >2y
	});
});

describe('trendSeries', () => {
	it('zero-fills every day in the range and sums per day', () => {
		const entries = [
			makeEntry({ duration: '3600', start_time: '2026-08-15T09:00:00' }),
			makeEntry({ duration: '1800', start_time: '2026-08-15T20:00:00' })
		];
		const range: DateRange = { start: '2026-08-14', end: '2026-08-16' };
		const { unit, buckets } = trendSeries(entries, range, 'day');
		expect(unit).toBe('day');
		expect(buckets.map((b) => b.totalSeconds)).toEqual([0, 5400, 0]);
		expect(buckets).toHaveLength(3);
	});

	it('assigns entries to the correct weekly bucket', () => {
		// Range covers two Sat-start weeks: Aug 15–21 and Aug 22–28 (2026).
		const entries = [
			makeEntry({ duration: '3600', start_time: '2026-08-15T09:00:00' }),
			makeEntry({ duration: '7200', start_time: '2026-08-24T09:00:00' })
		];
		const range: DateRange = { start: '2026-08-15', end: '2026-08-28' };
		const { unit, buckets } = trendSeries(entries, range, 'week');
		expect(unit).toBe('week');
		expect(buckets).toHaveLength(2);
		expect(buckets[0].totalSeconds).toBe(3600);
		expect(buckets[1].totalSeconds).toBe(7200);
	});

	it('assigns entries to the correct monthly bucket', () => {
		const entries = [
			makeEntry({ duration: '3600', start_time: '2026-06-15T09:00:00' }),
			makeEntry({ duration: '60', start_time: '2026-07-01T09:00:00' })
		];
		const range: DateRange = { start: '2026-06-01', end: '2026-07-31' };
		const { unit, buckets } = trendSeries(entries, range, 'month');
		expect(unit).toBe('month');
		expect(buckets).toHaveLength(2);
		expect(buckets[0].totalSeconds).toBe(3600);
		expect(buckets[1].totalSeconds).toBe(60);
	});

	it('skips entries outside the range', () => {
		const entries = [makeEntry({ duration: '3600', start_time: '2025-01-01T09:00:00' })];
		const range: DateRange = { start: '2026-08-14', end: '2026-08-16' };
		const { buckets } = trendSeries(entries, range, 'day');
		expect(buckets.every((b) => b.totalSeconds === 0)).toBe(true);
	});
});

// -----------------------------------------------------------------------------
// Heatmap
// -----------------------------------------------------------------------------

describe('heatmapMatrix', () => {
	it('fills weekday × hour cells and tracks max/total', () => {
		const entries = [
			makeEntry({ duration: '3600', start_time: '2026-08-15T09:00:00' }), // Sat 09
			makeEntry({ duration: '1800', start_time: '2026-08-15T09:30:00' }), // Sat 09
			makeEntry({ duration: '600', start_time: '2026-08-17T22:00:00' }) // Mon 22
		];
		const matrix = heatmapMatrix(entries);
		expect(matrix.values[0][9]).toBe(5400);
		expect(matrix.values[2][22]).toBe(600);
		expect(matrix.values[6][9]).toBe(0);
		expect(matrix.maxSeconds).toBe(5400);
		expect(matrix.totalSeconds).toBe(6000);
	});
});

// -----------------------------------------------------------------------------
// Server-aggregate helpers (report_data payload -> view models)
// -----------------------------------------------------------------------------

describe('trendSeriesFromDaily', () => {
	it('folds dated server rows into zero-filled daily buckets', () => {
		const range: DateRange = { start: '2026-08-14', end: '2026-08-16' };
		const { unit, buckets } = trendSeriesFromDaily(
			[
				{ date: '2026-08-14', seconds: 1200 },
				{ date: '2026-08-16', seconds: 3600 }
			],
			range
		);
		expect(unit).toBe('day');
		expect(buckets).toHaveLength(3);
		expect(buckets[0].totalSeconds).toBe(1200);
		expect(buckets[1].totalSeconds).toBe(0);
		expect(buckets[2].totalSeconds).toBe(3600);
	});

	it('switches to weekly buckets beyond 92 days and merges daily rows', () => {
		const range: DateRange = { start: '2026-01-01', end: '2026-08-01' };
		const { unit, buckets } = trendSeriesFromDaily(
			[
				{ date: '2026-01-01', seconds: 600 }, // Thursday — clipped into the Sat-start week frame
				{ date: '2026-01-03', seconds: 300 } // Saturday — starts the next week frame
			],
			range
		);
		expect(unit).toBe('week');
		// Frame 0 spans 2025-12-27..2026-01-02 (backtracked to Saturday, clipped
		// to the range start), frame 1 spans 2026-01-03..01-09.
		expect(buckets[0].totalSeconds).toBe(600);
		expect(buckets[1].totalSeconds).toBe(300);
	});
});

describe('heatmapFromValues', () => {
	it('derives max/total from the server matrix without copying values', () => {
		const values: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
		values[0][9] = 3600;
		values[2][22] = 600;
		const matrix = heatmapFromValues(values);
		expect(matrix.maxSeconds).toBe(3600);
		expect(matrix.totalSeconds).toBe(4200);
		expect(matrix.values).toBe(values);
	});
});

describe('dayOfWeekFromAggregates', () => {
	it('maps Saturday-first arrays onto DAY_LABELS_SAT_FIRST with averages', () => {
		const seconds = [7200, 0, 3600, 0, 0, 0, 0];
		const counts = [2, 0, 1, 0, 0, 0, 0];
		const dow = dayOfWeekFromAggregates(seconds, counts);
		expect(dow[0]).toEqual({ name: 'Sat', totalSeconds: 7200, count: 2, avgSeconds: 3600 });
		expect(dow[1]).toEqual({ name: 'Sun', totalSeconds: 0, count: 0, avgSeconds: 0 });
		expect(dow[2].name).toBe('Mon');
		expect(dow).toHaveLength(7);
	});
});

describe('hourlyFromAggregates', () => {
	it('builds 24 hour buckets from the server arrays', () => {
		const seconds: number[] = Array(24).fill(0);
		seconds[9] = 5400;
		seconds[22] = 600;
		const counts: number[] = Array(24).fill(0);
		counts[9] = 2;
		const hours = hourlyFromAggregates(seconds, counts);
		expect(hours).toHaveLength(24);
		expect(hours[9]).toEqual({ hour: 9, label: '09:00', totalSeconds: 5400, count: 2 });
		expect(hours[22].totalSeconds).toBe(600);
	});
});
