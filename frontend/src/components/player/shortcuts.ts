export type PlayerAction =
  | { type: 'toggle' }
  | { type: 'seekBy'; seconds: number }
  | { type: 'volumeBy'; delta: number }
  | { type: 'mute' }
  | { type: 'fullscreen' }
  | { type: 'theater' }
  | { type: 'pip' }
  | { type: 'seekPercent'; percent: number }
  | { type: 'rateStep'; direction: 1 | -1 }
  | { type: 'seekTo'; position: 'start' | 'end' };

interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** YouTube's keyboard map. Returns null for keys the player does not own. */
export function actionForKey(e: KeyLike): PlayerAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.shiftKey && (e.key === '>' || e.key === '.')) return { type: 'rateStep', direction: 1 };
  if (e.shiftKey && (e.key === '<' || e.key === ',')) return { type: 'rateStep', direction: -1 };
  if (/^[0-9]$/.test(e.key)) return { type: 'seekPercent', percent: Number(e.key) * 10 };
  switch (e.key.toLowerCase()) {
    case ' ':
    case 'k':
      return { type: 'toggle' };
    case 'j':
      return { type: 'seekBy', seconds: -10 };
    case 'l':
      return { type: 'seekBy', seconds: 10 };
    case 'arrowleft':
      return { type: 'seekBy', seconds: -5 };
    case 'arrowright':
      return { type: 'seekBy', seconds: 5 };
    case 'arrowup':
      return { type: 'volumeBy', delta: 0.05 };
    case 'arrowdown':
      return { type: 'volumeBy', delta: -0.05 };
    case 'm':
      return { type: 'mute' };
    case 'f':
      return { type: 'fullscreen' };
    case 't':
      return { type: 'theater' };
    case 'i':
      return { type: 'pip' };
    case 'home':
      return { type: 'seekTo', position: 'start' };
    case 'end':
      return { type: 'seekTo', position: 'end' };
    default:
      return null;
  }
}

/** Never steal keys from something the user is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

export const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export function stepRate(current: number, direction: 1 | -1): number {
  const i = RATES.findIndex((r) => r >= current - 1e-9);
  const at = i === -1 ? RATES.length - 1 : i;
  return RATES[Math.min(RATES.length - 1, Math.max(0, at + direction))] ?? 1;
}
