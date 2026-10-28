// One-off codemod, pass 2 (SYSTEM_DESIGN.md §30.5–30.6): the generated look's shapes and effects →
// the studio language. Pass 1 (codemod-tokens.mjs) made colours semantic; this one fixes form.
// Usage: node scripts/codemod-studio.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
const SKIP = ['components/player/', 'components/ui-config/', 'components/landing/product-frame.tsx'];
const dry = process.argv.includes('--dry');

const LINK = 'text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground';
const RULES = [
  [/\brounded-3xl\b/g, 'rounded-panel'],
  [/\brounded-2xl\b/g, 'rounded-[14px]'],
  [/ ?\b(?:[a-z-]+:)?backdrop-blur(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl))?\b/g, ''],
  [/\bbg-card\/(?:\d+|\[[0-9.]+\])/g, 'bg-background'],
  [/\b(border|divide)-foreground\/(?:\[0\.0\d+\]|10)(?![\w-])/g, '$1-border'],
  [/\bfont-display /g, ''],
  [/ font-display\b/g, ''],
  [/\bfont-bold\b/g, 'font-semibold'],
  [/\b((?:focus-visible|focus):)ring-primary(?:\/\d+)?\b/g, '$1ring-ring/35'],
  [/\btext-primary (?:transition-colors )?hover:underline\b/g, LINK],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP.some((s) => rel.startsWith(s))) continue;
  const src = readFileSync(file, 'utf8');
  let n = 0;
  let next = src;
  for (const [re, to] of RULES) next = next.replace(re, (...m) => (n++, typeof to === 'string' ? to.replace(/\$(\d)/g, (_, i) => m[+i] ?? '') : to));
  if (n) {
    total += n;
    console.log(`${String(n).padStart(4)}  ${rel}`);
    if (!dry) writeFileSync(file, next);
  }
}
console.log(`${dry ? '[dry] ' : ''}${total} replacements`);
