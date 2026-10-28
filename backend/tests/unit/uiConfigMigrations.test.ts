import fs from 'fs';
import path from 'path';
import { CURRENT_SCHEMA_VERSION, migrateUiConfig } from '../../config/ui/migrations';
import { validateUiConfig } from '../../utils/uiConfigValidator';

const v2Default = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/ui/ui-config.default.json'), 'utf8'));

// The v1 default as it shipped and as it sits in databases seeded before Part VIII.
const v1Default = () => ({
  schemaVersion: 1,
  branding: {
    appName: 'LearnSphere',
    wordmark: { primary: 'Learn', accent: 'Sphere' },
    tagline: 'Learn without limits',
    logoUrl: null,
    supportEmail: 'support@learnsphere.dev',
  },
  theme: { primary: '83 78% 55%', accent: '83 78% 55%', background: '240 24% 5%', radius: '0.75rem' },
  navigation: v2Default().navigation,
  home: {
    hero: {
      eyebrow: 'The learning platform for modern teams',
      title: 'Learn without limits.',
      titleHighlight: 'Teach without friction.',
      subtitle:
        'LearnSphere unifies courses, adaptive video, analytics and certificates into one beautifully fast workspace — so you can focus on what matters: helping people grow.',
      ctaLabel: 'Create free account',
      ctaHref: '/signup',
      footnote: 'No credit card required · Free forever for individuals',
    },
    sections: [
      { type: 'features', enabled: true },
      { type: 'howItWorks', enabled: false },
      { type: 'finalCta', enabled: true },
    ],
  },
  features: { purchases: true, instructorRequests: true, studyProgress: true },
  copy: v2Default().copy,
  announcement: v2Default().announcement,
});

describe('ui-config migrations', () => {
  it('is at schema version 2', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
  });

  it('upgrades the shipped v1 default to a valid v2 document with the new copy', () => {
    const out = migrateUiConfig(v1Default());
    expect(validateUiConfig(out)).toEqual({ ok: true, problems: [] });
    expect(out.theme).toEqual({ mode: 'light', highlight: '50 100% 65%', radius: '0.625rem' });
    expect(out.home.hero.title).toBe(v2Default().home.hero.title);
    expect(out.branding.tagline).toBe(v2Default().branding.tagline);
    expect(out.auth).toEqual(v2Default().auth);
  });

  it('keeps what an admin changed: colours, radius, hero text and section toggles', () => {
    const doc = v1Default();
    doc.theme.primary = '210 80% 60%';
    doc.theme.radius = '4px';
    doc.home.hero.title = 'Our academy';
    doc.branding.tagline = 'Ours';
    const out = migrateUiConfig(doc);
    expect(out.theme.highlight).toBe('210 80% 60%');
    expect(out.theme.radius).toBe('4px');
    expect(out.home.hero.title).toBe('Our academy');
    expect(out.branding.tagline).toBe('Ours');
    expect(out.home.sections).toEqual([
      { type: 'features', enabled: true },
      { type: 'howItWorks', enabled: false },
      { type: 'faq', enabled: true },
      { type: 'finalCta', enabled: true },
    ]);
  });

  it('leaves a current document alone and refuses an unknown version', () => {
    const doc = v2Default();
    expect(migrateUiConfig(doc)).toBe(doc);
    expect(() => migrateUiConfig({ ...doc, schemaVersion: 7 })).toThrow(/No migration/);
  });
});
