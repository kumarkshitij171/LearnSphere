// Watch progress, per viewer and per browser. Server-side progress (so it follows a student across
// devices) is recorded as backend work in SYSTEM_DESIGN.md §13; until then this is the source of
// "completed", "resume at" and "continue watching". Storage may be unavailable — every access is
// guarded and the app behaves as "no progress yet".

export interface LessonProgress {
  position: number;
  duration: number;
  completed: boolean;
  updatedAt: number;
  courseId: string;
}

export type ProgressMap = Record<string, LessonProgress>;

/** a lesson counts as watched once 90% of it has played — the credits rarely matter */
export const COMPLETE_AT = 0.9;
const key = (userId: string) => `learnsphere.progress.v1.${userId}`;

export function loadProgress(userId: string): ProgressMap {
  try {
    const raw = window.localStorage.getItem(key(userId));
    const parsed = raw ? (JSON.parse(raw) as ProgressMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function recordProgress(
  userId: string,
  courseId: string,
  videoId: string,
  position: number,
  duration: number,
  ended = false
): ProgressMap {
  const all = loadProgress(userId);
  if (!Number.isFinite(duration) || duration <= 0) return all;
  const previous = all[videoId];
  // opening a lesson reports position 0; that is a visit, not watching, so it leaves no trace
  if (!previous && !ended && position < 1) return all;
  const completed = Boolean(previous?.completed) || ended || position / duration >= COMPLETE_AT;
  all[videoId] = {
    // a finished lesson restarts from the top next time
    position: ended ? 0 : Math.max(0, position),
    duration,
    completed,
    updatedAt: Date.now(),
    courseId,
  };
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(all));
  } catch {
    // ignore: progress is a convenience
  }
  return all;
}

/** Where to resume: only when meaningfully into the lesson and not basically finished. */
export function resumePosition(entry: LessonProgress | undefined): number | null {
  if (!entry || entry.duration <= 0) return null;
  if (entry.position < 5 || entry.position / entry.duration > 0.95) return null;
  return entry.position;
}

export function watchedFraction(entry: LessonProgress | undefined): number {
  if (!entry || entry.duration <= 0) return 0;
  return entry.completed ? 1 : Math.min(1, entry.position / entry.duration);
}

/** The most recently watched, unfinished lesson across all courses (dashboard "Continue watching"). */
export function lastUnfinished(map: ProgressMap): { videoId: string; entry: LessonProgress } | null {
  const candidates = Object.entries(map).filter(([, e]) => !e.completed && resumePosition(e) !== null);
  candidates.sort((a, b) => b[1].updatedAt - a[1].updatedAt);
  const top = candidates[0];
  return top ? { videoId: top[0], entry: top[1] } : null;
}
