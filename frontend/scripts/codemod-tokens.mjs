// One-off codemod (SYSTEM_DESIGN.md §30.5): hard-coded dark-palette classes → semantic tokens, so
// the same markup renders in the studio (light) and theater (dark) looks. The player and the
// UI-config editor are always dark and keep their literal colours.
// Usage: node scripts/codemod-tokens.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const SKIP = ['components/player/', 'components/ui-config/'];
const dry = process.argv.includes('--dry');

const FAMILY = {
  emerald: 'success', green: 'success', teal: 'success',
  red: 'danger', rose: 'danger',
  amber: 'warning', yellow: 'warning', orange: 'warning',
  sky: 'info', blue: 'info',
  lime: 'primary',
};
const PROPS = 'text|bg|border|ring|divide|from|to|via|outline|fill|stroke|placeholder|decoration|caret|ring-offset|border-[trblxy]';
const OPACITY = '(\\/\\[?[0-9.]+\\]?)?';

const palette = new RegExp(`\\b(${PROPS})-(${Object.keys(FAMILY).join('|')})-\\d{2,3}${OPACITY}(?![\\w-])`, 'g');
// text-white stays: outside the player it sits on images and video, where white is right in both looks
const white = new RegExp(`\\b(bg|border|ring|divide|from|to|via|outline|ring-offset|border-[trblxy])-white${OPACITY}(?![\\w-])`, 'g');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

let files = 0;
let edits = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP.some((s) => rel.startsWith(s))) continue;
  const src = readFileSync(file, 'utf8');
  let n = 0;
  const next = src
    .replace(palette, (_m, prop, fam, op = '') => (n++, `${prop}-${FAMILY[fam]}${op}`))
    .replace(white, (_m, prop, op = '') => (n++, `${prop}-foreground${op}`));
  if (n) {
    files++;
    edits += n;
    console.log(`${String(n).padStart(4)}  ${rel}`);
    if (!dry) writeFileSync(file, next);
  }
}
console.log(`${dry ? '[dry] ' : ''}${edits} replacements in ${files} files`);
