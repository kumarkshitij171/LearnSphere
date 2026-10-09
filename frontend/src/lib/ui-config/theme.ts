import type { UiConfig } from './types';

const HSL = /^\d{1,3} \d{1,3}% \d{1,3}%$/;
const RADIUS = /^(0|[0-9]*\.?[0-9]+(rem|px))$/;

/**
 * The theme as CSS variables for <html style>, overriding globals.css. Values are re-checked
 * here because they land in a style attribute: anything malformed is dropped, not applied.
 */
export function themeVars(theme: UiConfig['theme']): Record<string, string> {
  const vars: Record<string, string> = {};
  if (HSL.test(theme.primary)) {
    vars['--primary'] = theme.primary;
    vars['--ring'] = theme.primary;
  }
  if (HSL.test(theme.accent)) vars['--accent'] = theme.accent;
  if (HSL.test(theme.background)) vars['--background'] = theme.background;
  if (RADIUS.test(theme.radius)) vars['--radius'] = theme.radius;
  return vars;
}
