import type { UiConfig } from './types';

const HSL = /^\d{1,3} \d{1,3}% \d{1,3}%$/;
const RADIUS = /^(0|[0-9]*\.?[0-9]+(rem|px))$/;

/**
 * The admin-tunable part of the theme as CSS variables for <html style>. Values are re-checked
 * here because they land in a style attribute: anything malformed is dropped, not applied.
 */
export function themeVars(theme: UiConfig['theme']): Record<string, string> {
  const vars: Record<string, string> = {};
  if (HSL.test(theme.highlight)) vars['--highlight'] = theme.highlight;
  if (RADIUS.test(theme.radius)) vars['--radius'] = theme.radius;
  return vars;
}

/** Which designed token set the app uses: `studio` (light) or `theater` (dark). */
export function themeLook(theme: UiConfig['theme']): 'studio' | 'theater' {
  return theme.mode === 'dark' ? 'theater' : 'studio';
}
