import { describe, expect, it } from 'vitest';
import { formatTime, spokenTime } from './time';
import { actionForKey, isTypingTarget, stepRate } from './shortcuts';
import { qualityLabel } from './prefs';

describe('formatTime', () => {
  it('formats like a video clock', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5.9)).toBe('0:05');
    expect(formatTime(83)).toBe('1:23');
    expect(formatTime(724)).toBe('12:04');
    expect(formatTime(3723)).toBe('1:02:03');
  });
  it('never shows NaN before metadata loads', () => {
    expect(formatTime(Number.NaN)).toBe('0:00');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
  });
  it('speaks time for screen readers', () => {
    expect(spokenTime(83)).toBe('1 minute 23 seconds');
    expect(spokenTime(3600)).toBe('1 hour');
    expect(spokenTime(0)).toBe('0 seconds');
  });
});

describe('keyboard shortcuts', () => {
  it('follows the YouTube map', () => {
    expect(actionForKey({ key: ' ' })).toEqual({ type: 'toggle' });
    expect(actionForKey({ key: 'k' })).toEqual({ type: 'toggle' });
    expect(actionForKey({ key: 'K' })).toEqual({ type: 'toggle' });
    expect(actionForKey({ key: 'j' })).toEqual({ type: 'seekBy', seconds: -10 });
    expect(actionForKey({ key: 'l' })).toEqual({ type: 'seekBy', seconds: 10 });
    expect(actionForKey({ key: 'ArrowLeft' })).toEqual({ type: 'seekBy', seconds: -5 });
    expect(actionForKey({ key: 'ArrowUp' })).toEqual({ type: 'volumeBy', delta: 0.05 });
    expect(actionForKey({ key: 'f' })).toEqual({ type: 'fullscreen' });
    expect(actionForKey({ key: '7' })).toEqual({ type: 'seekPercent', percent: 70 });
    expect(actionForKey({ key: '>', shiftKey: true })).toEqual({ type: 'rateStep', direction: 1 });
    expect(actionForKey({ key: '<', shiftKey: true })).toEqual({ type: 'rateStep', direction: -1 });
  });
  it('leaves browser and OS shortcuts alone', () => {
    expect(actionForKey({ key: 'f', metaKey: true })).toBeNull();
    expect(actionForKey({ key: 'l', ctrlKey: true })).toBeNull();
    expect(actionForKey({ key: 'x' })).toBeNull();
  });
  it('steps playback speed through the menu values and clamps', () => {
    expect(stepRate(1, 1)).toBe(1.25);
    expect(stepRate(1, -1)).toBe(0.75);
    expect(stepRate(2, 1)).toBe(2);
    expect(stepRate(0.25, -1)).toBe(0.25);
  });
  it('never fires while the user types', () => {
    const typing = (match: boolean, editable = false) =>
      ({ isContentEditable: editable, closest: () => (match ? {} : null) }) as unknown as EventTarget;
    expect(isTypingTarget(typing(true))).toBe(true);
    expect(isTypingTarget(typing(false, true))).toBe(true);
    expect(isTypingTarget(typing(false))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('quality labels', () => {
  it('labels renditions the way viewers know them', () => {
    expect(qualityLabel(2160)).toEqual({ name: '2160p', badge: '4K' });
    expect(qualityLabel(1080)).toEqual({ name: '1080p', badge: 'HD' });
    expect(qualityLabel(1080, 60)).toEqual({ name: '1080p60', badge: 'HD' });
    expect(qualityLabel(480)).toEqual({ name: '480p' });
    expect(qualityLabel(720, 30)).toEqual({ name: '720p', badge: 'HD' });
  });
});
