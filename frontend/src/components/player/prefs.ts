// Per-viewer conveniences. Storage can be missing or throw (private mode, blocked site data), so
// every access is guarded and the player works the same without it.
export interface PlayerPrefs {
  volume: number;
  muted: boolean;
  rate: number;
  /** preferred rendition by its short side (1080 = "1080p"), or 'auto' */
  quality: number | 'auto';
}

const KEY = 'learnsphere.player.v1';
const DEFAULTS: PlayerPrefs = { volume: 1, muted: false, rate: 1, quality: 'auto' };

export function loadPrefs(): PlayerPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<PlayerPrefs>;
    return {
      volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : DEFAULTS.volume,
      muted: typeof p.muted === 'boolean' ? p.muted : DEFAULTS.muted,
      rate: typeof p.rate === 'number' && p.rate >= 0.25 && p.rate <= 2 ? p.rate : DEFAULTS.rate,
      quality: p.quality === 'auto' || (typeof p.quality === 'number' && p.quality > 0) ? p.quality : DEFAULTS.quality,
    };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(patch: Partial<PlayerPrefs>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    // a convenience, not state anyone depends on
  }
}

const RESUME_KEY = (videoId: string) => `learnsphere.resume.${videoId}`;

export function loadResume(videoId: string): number | null {
  try {
    const v = Number(window.localStorage.getItem(RESUME_KEY(videoId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveResume(videoId: string, seconds: number | null): void {
  try {
    if (seconds == null) window.localStorage.removeItem(RESUME_KEY(videoId));
    else window.localStorage.setItem(RESUME_KEY(videoId), String(Math.floor(seconds)));
  } catch {
    // ignore
  }
}

/** YouTube-style rendition label from its short side: "2160p 4K", "1080p HD", with the frame rate above 30. */
export function qualityLabel(height: number, frameRate?: number): { name: string; badge?: string } {
  const fps = frameRate && frameRate > 31 ? String(Math.round(frameRate)) : '';
  const name = `${height}p${fps}`;
  if (height >= 2160) return { name, badge: '4K' };
  if (height >= 1440) return { name, badge: 'HD' };
  if (height >= 720) return { name, badge: 'HD' };
  return { name };
}
