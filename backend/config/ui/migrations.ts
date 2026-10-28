import fs from 'fs';
import path from 'path';

// Upgrades a stored document to the current schemaVersion on read and on seed. Additive changes
// (a new optional key with a default) need no entry here; only a breaking change bumps the version.
export const CURRENT_SCHEMA_VERSION = 2;

type Migration = (doc: any) => any;

// v1's shipped values. A field still holding one of these was never customised, so v2 replaces it.
const V1_DEFAULT_THEME = { primary: '83 78% 55%', radius: '0.75rem' };
const V1_DEFAULT_HERO: Record<string, string> = {
  eyebrow: 'The learning platform for modern teams',
  title: 'Learn without limits.',
  titleHighlight: 'Teach without friction.',
  subtitle:
    'LearnSphere unifies courses, adaptive video, analytics and certificates into one beautifully fast workspace — so you can focus on what matters: helping people grow.',
  ctaLabel: 'Create free account',
  ctaHref: '/signup',
  footnote: 'No credit card required · Free forever for individuals',
};
const V1_DEFAULT_TAGLINE = 'Learn without limits';

let v2Default: any;
const defaults = () =>
  (v2Default ??= JSON.parse(fs.readFileSync(path.join(__dirname, 'ui-config.default.json'), 'utf8')));

// v2 (frontend Part VIII): the theme becomes two designed looks plus a highlight; the landing and
// auth copy moves out of the components into the document. Admin edits are kept; v1's default copy,
// which claimed features that never existed, is replaced.
const v1ToV2: Migration = (doc) => {
  const next = defaults();
  const theme = doc.theme ?? {};
  const hero = doc.home?.hero ?? {};
  const keptHero = Object.fromEntries(
    Object.entries(next.home.hero).map(([key, value]) => {
      const old = hero[key];
      return [key, typeof old === 'string' && old !== V1_DEFAULT_HERO[key] ? old : value];
    })
  );
  const oldSections: Array<{ type: string; enabled: boolean }> = doc.home?.sections ?? [];
  const sections = oldSections.filter((s) => ['features', 'howItWorks', 'finalCta'].includes(s.type));
  if (!sections.some((s) => s.type === 'faq')) {
    const at = sections.findIndex((s) => s.type === 'finalCta');
    sections.splice(at < 0 ? sections.length : at, 0, { type: 'faq', enabled: true });
  }
  return {
    ...doc,
    schemaVersion: 2,
    branding: {
      ...doc.branding,
      tagline: doc.branding?.tagline === V1_DEFAULT_TAGLINE ? next.branding.tagline : doc.branding?.tagline,
    },
    theme: {
      mode: 'light',
      highlight: !theme.primary || theme.primary === V1_DEFAULT_THEME.primary ? next.theme.highlight : theme.primary,
      radius: !theme.radius || theme.radius === V1_DEFAULT_THEME.radius ? next.theme.radius : theme.radius,
    },
    home: {
      hero: keptHero,
      sections,
      features: next.home.features,
      howItWorks: next.home.howItWorks,
      faq: next.home.faq,
      finalCta: next.home.finalCta,
    },
    auth: next.auth,
  };
};

const MIGRATIONS: Record<number, Migration> = {
  1: v1ToV2,
};

export const migrateUiConfig = (doc: any): any => {
  let current = doc;
  while (current?.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[current?.schemaVersion];
    if (!step) throw new Error(`No migration from ui-config schemaVersion ${current?.schemaVersion}`);
    current = step(current);
  }
  return current;
};
