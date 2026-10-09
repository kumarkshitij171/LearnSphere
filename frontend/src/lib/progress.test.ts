import { beforeEach, describe, expect, it } from 'vitest';
import { lastUnfinished, loadProgress, recordProgress, resumePosition, watchedFraction } from './progress';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
  };
});

describe('watch progress', () => {
  it('marks a lesson complete at 90% and keeps it complete', () => {
    recordProgress('u1', 'c1', 'v1', 50, 100);
    expect(loadProgress('u1').v1!.completed).toBe(false);
    recordProgress('u1', 'c1', 'v1', 91, 100);
    expect(loadProgress('u1').v1!.completed).toBe(true);
    recordProgress('u1', 'c1', 'v1', 10, 100);
    expect(loadProgress('u1').v1!.completed).toBe(true);
  });

  it('restarts a finished lesson from the top', () => {
    recordProgress('u1', 'c1', 'v1', 99, 100, true);
    expect(loadProgress('u1').v1!.position).toBe(0);
  });

  it('only offers to resume when it is worth it', () => {
    expect(resumePosition({ position: 3, duration: 600, completed: false, updatedAt: 0, courseId: 'c' })).toBeNull();
    expect(resumePosition({ position: 252, duration: 600, completed: false, updatedAt: 0, courseId: 'c' })).toBe(252);
    expect(resumePosition({ position: 590, duration: 600, completed: false, updatedAt: 0, courseId: 'c' })).toBeNull();
  });

  it('keeps viewers on a shared browser apart', () => {
    recordProgress('u1', 'c1', 'v1', 50, 100);
    expect(loadProgress('u2')).toEqual({});
  });

  it('finds the lesson to continue', () => {
    recordProgress('u1', 'c1', 'v1', 50, 100);
    recordProgress('u1', 'c1', 'v2', 95, 100);
    expect(lastUnfinished(loadProgress('u1'))?.videoId).toBe('v1');
    expect(watchedFraction(loadProgress('u1').v2)).toBe(1);
  });

  it('survives storage that throws', () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    };
    expect(loadProgress('u1')).toEqual({});
    expect(() => recordProgress('u1', 'c1', 'v1', 50, 100)).not.toThrow();
  });
});
