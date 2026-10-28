// Seconds watched and lessons finished per local day, per viewer and per browser. lib/progress keeps
// each lesson's last position only, so it cannot say how long anyone watched; this small ledger can.
// Like progress, storage may be unavailable: every access is guarded and the app shows "nothing yet".

export interface DayActivity {
  /** seconds actually played */
  s: number;
  /** lessons that crossed the "watched" line that day */
  f: number;
}

export type ActivityMap = Record<string, DayActivity>;

/** a forward step longer than this between two progress reports is a seek, not watching */
export const MAX_STEP_SECONDS = 30;
export const KEEP_DAYS = 84;

const key = (userId: string) => `learnsphere.activity.v1.${userId}`;

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function prune(map: ActivityMap, now: Date): ActivityMap {
  const oldest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (KEEP_DAYS - 1));
  const cutoff = dayKey(oldest);
  return Object.fromEntries(Object.entries(map).filter(([day]) => day >= cutoff));
}

export function loadActivity(userId: string): ActivityMap {
  try {
    const raw = window.localStorage.getItem(key(userId));
    const parsed = raw ? (JSON.parse(raw) as ActivityMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function save(userId: string, map: ActivityMap) {
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(map));
  } catch {
    // a convenience, not state
  }
}

/** Pure: the map with `seconds` of watching (and optionally one finished lesson) added to today. */
export function addActivity(map: ActivityMap, seconds: number, finished: boolean, now = new Date()): ActivityMap {
  const watched = Number.isFinite(seconds) && seconds > 0 && seconds <= MAX_STEP_SECONDS ? seconds : 0;
  if (!watched && !finished) return map;
  const day = dayKey(now);
  const current = map[day] ?? { s: 0, f: 0 };
  return prune({ ...map, [day]: { s: current.s + watched, f: current.f + (finished ? 1 : 0) } }, now);
}

export function recordActivity(userId: string, seconds: number, finished = false, now = new Date()): void {
  const before = loadActivity(userId);
  const after = addActivity(before, seconds, finished, now);
  if (after !== before) save(userId, after);
}

export interface WeekDay {
  key: string;
  /** M, T, W … */
  label: string;
  seconds: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface WeekSummary {
  days: WeekDay[];
  totalSeconds: number;
  activeDays: number;
  lessonsFinished: number;
}

/** Monday to Sunday of the week containing `now`. */
export function weekSummary(map: ActivityMap, now = new Date()): WeekSummary {
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
  const today = dayKey(now);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const k = dayKey(date);
    return { key: k, label: 'MTWTFSS'[i]!, seconds: map[k]?.s ?? 0, isToday: k === today, isFuture: k > today };
  });
  return {
    days,
    totalSeconds: days.reduce((sum, d) => sum + d.seconds, 0),
    activeDays: days.filter((d) => d.seconds > 0).length,
    lessonsFinished: days.reduce((sum, d) => sum + (map[d.key]?.f ?? 0), 0),
  };
}

/** "2h 27m", "14m", "45s" */
export function formatWatched(seconds: number): string {
  const s = Math.round(seconds);
  if (s <= 0) return '0m';
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
