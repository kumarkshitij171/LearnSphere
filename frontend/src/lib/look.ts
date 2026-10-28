// A viewer's light/dark choice. The UI config's theme.mode is the default; this cookie overrides it
// per browser. A cookie rather than localStorage so the server and the pre-paint script both see it.

export type LookPreference = 'light' | 'dark' | 'system';
export type Look = 'studio' | 'theater';

export const LOOK_COOKIE = 'ls-look';
const ONE_YEAR = 60 * 60 * 24 * 365;

export function parsePreference(value: string | undefined | null): LookPreference | null {
  return value === 'light' || value === 'dark' || value === 'system' ? value : null;
}

export function readPreference(): LookPreference | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOOK_COOKIE}=([^;]+)`));
  return parsePreference(match?.[1]);
}

export function resolveLook(pref: LookPreference | null, configDefault: Look): Look {
  if (pref === 'light') return 'studio';
  if (pref === 'dark') return 'theater';
  if (pref === 'system' && typeof window !== 'undefined') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theater' : 'studio';
  }
  return configDefault;
}

export function savePreference(pref: LookPreference) {
  document.cookie = `${LOOK_COOKIE}=${pref}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
}

export function applyLook(look: Look) {
  document.documentElement.setAttribute('data-look', look);
  window.dispatchEvent(new CustomEvent('ls-look', { detail: look }));
}

/** Runs in <head> before first paint, so "system" never flashes the wrong look. Kept tiny and dependency-free. */
export const LOOK_BOOT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${LOOK_COOKIE}=(light|dark|system)/);if(!m)return;var p=m[1],d=document.documentElement;d.setAttribute('data-look',p==='dark'?'theater':p==='light'?'studio':(window.matchMedia('(prefers-color-scheme: dark)').matches?'theater':'studio'));}catch(e){}})();`;
