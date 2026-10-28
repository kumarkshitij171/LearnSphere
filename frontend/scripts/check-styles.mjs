// Fails the lint when the generated look creeps back (SYSTEM_DESIGN.md §30.5). Colour must come from
// tokens so both looks work; the player and the UI-config editor are always dark and are exempt.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../src/', import.meta.url).pathname;
// the landing page's player illustration is drawn over video, like the player itself
const EXEMPT = ['components/player/', 'components/ui-config/', 'components/landing/product-frame.tsx'];

const RULES = [
  [/\b(?:text|bg|border|ring|divide|from|to|via|outline|fill|stroke)-(?:lime|emerald|green|teal|red|rose|amber|yellow|orange|sky|blue|indigo|violet|purple|fuchsia|pink|cyan|zinc|neutral|gray|slate|stone)-\d{2,3}\b/, 'raw palette colour — use a semantic token (success, warning, danger, info, …)'],
  [/\b(?:bg|border|ring|divide|from|to|via|outline)-white\b/, 'white surface or line — use foreground/N, surface or border'],
  [/\bbackdrop-blur\b/, 'blur behind surfaces — use a solid background'],
  [/\bbg-gradient-to-/, 'gradient background — studio surfaces are flat'],
  [/\brounded-(?:2xl|3xl)\b/, 'oversized radius — use rounded-[14px] or rounded-panel'],
  [/\bfont-display\b/, 'display is Geist by weight and tracking — use text-display-* / text-title'],
  [/\btext-\[#/, 'hex text colour — use a token'],
  [/\b(?:glass|text-gradient|glow-primary|bg-spotlight|bg-grid|animate-blob|animate-fade-up|animate-pulse-glow)\b/, 'removed effect utility'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|css)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const problems = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (EXEMPT.some((e) => rel.startsWith(e))) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const [re, why] of RULES) {
      const m = line.match(re);
      if (m) problems.push(`src/${rel}:${i + 1}  ${m[0]}  ${why}`);
    }
  });
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\ncheck-styles: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('check-styles: ok');
