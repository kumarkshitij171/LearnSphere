import { describe, expect, it } from 'vitest';
import { addActivity, dayKey, formatWatched, KEEP_DAYS, MAX_STEP_SECONDS, weekSummary, type ActivityMap } from './activity';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('activity ledger', () => {
  it('buckets by local day, either side of midnight', () => {
    let map: ActivityMap = {};
    map = addActivity(map, 5, false, at(2026, 10, 27, 23));
    map = addActivity(map, 5, false, at(2026, 10, 28, 0));
    expect(map['2026-10-27']).toEqual({ s: 5, f: 0 });
    expect(map['2026-10-28']).toEqual({ s: 5, f: 0 });
  });

  it('ignores seeks, backwards steps and junk, but still counts a finished lesson', () => {
    const map = addActivity({}, MAX_STEP_SECONDS + 1, false, at(2026, 10, 28));
    expect(map).toEqual({});
    expect(addActivity({}, -3, false, at(2026, 10, 28))).toEqual({});
    expect(addActivity({}, Number.NaN, false, at(2026, 10, 28))).toEqual({});
    expect(addActivity({}, 400, true, at(2026, 10, 28))).toEqual({ '2026-10-28': { s: 0, f: 1 } });
  });

  it('keeps 12 weeks and drops anything older', () => {
    const now = at(2026, 10, 28);
    const old = dayKey(new Date(2026, 9, 28 - KEEP_DAYS));
    const map = addActivity({ [old]: { s: 100, f: 1 } }, 5, false, now);
    expect(map[old]).toBeUndefined();
    expect(map['2026-10-28']).toEqual({ s: 5, f: 0 });
  });
});

describe('weekSummary', () => {
  it('runs Monday to Sunday and totals the week only', () => {
    const map: ActivityMap = {
      '2026-10-25': { s: 999, f: 9 }, // the Sunday before
      '2026-10-26': { s: 600, f: 1 }, // Monday
      '2026-10-28': { s: 1200, f: 2 }, // Wednesday, today
    };
    const week = weekSummary(map, at(2026, 10, 28));
    expect(week.days.map((d) => d.label).join('')).toBe('MTWTFSS');
    expect(week.days[0]!.key).toBe('2026-10-26');
    expect(week.days[2]!.isToday).toBe(true);
    expect(week.days[3]!.isFuture).toBe(true);
    expect(week.totalSeconds).toBe(1800);
    expect(week.activeDays).toBe(2);
    expect(week.lessonsFinished).toBe(3);
  });

  it('treats Sunday as the end of the week', () => {
    const week = weekSummary({}, at(2026, 11, 1));
    expect(week.days[6]!.key).toBe('2026-11-01');
    expect(week.days[6]!.isToday).toBe(true);
  });
});

describe('formatWatched', () => {
  it('reads like a duration', () => {
    expect(formatWatched(0)).toBe('0m');
    expect(formatWatched(45)).toBe('45s');
    expect(formatWatched(14 * 60)).toBe('14m');
    expect(formatWatched(2 * 3600 + 7 * 60)).toBe('2h 07m');
  });
});
