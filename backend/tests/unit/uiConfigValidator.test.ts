import fs from 'fs';
import path from 'path';
import { validateUiConfig, assertSchemaSupported, MAX_DOCUMENT_BYTES } from '../../utils/uiConfigValidator';
import { canonicalJson, checksumOf } from '../../utils/canonicalJson';

const defaults = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/ui/ui-config.default.json'), 'utf8'));

const problemAt = (doc: unknown, pointer: string) =>
  validateUiConfig(doc).problems.find((p) => p.path === pointer)?.message;

describe('validateUiConfig', () => {
  it('accepts the checked-in default', () => {
    expect(validateUiConfig(defaults())).toEqual({ ok: true, problems: [] });
  });

  it('rejects javascript: and data: links anywhere a link is allowed', () => {
    const doc = defaults();
    doc.navigation.sidebar[0].href = 'javascript:alert(1)';
    doc.home.hero.ctaHref = 'data:text/html,hi';
    doc.announcement.href = 'http://insecure.example';
    const pointers = validateUiConfig(doc).problems.map((p) => p.path);
    expect(pointers).toEqual(
      expect.arrayContaining(['/navigation/sidebar/0/href', '/home/hero/ctaHref', '/announcement/href'])
    );
  });

  it('rejects unknown keys so the public document cannot carry a secret', () => {
    const doc = defaults();
    doc.branding.apiKey = 'sk_live_123';
    doc.extra = true;
    expect(problemAt(doc, '/branding/apiKey')).toBe('is not a known setting');
    expect(problemAt(doc, '/extra')).toBe('is not a known setting');
  });

  it('only allows icons from the allow-list', () => {
    const doc = defaults();
    doc.navigation.sidebar[1].icon = 'Skull';
    expect(problemAt(doc, '/navigation/sidebar/1/icon')).toMatch(/must be one of/);
  });

  it('checks lengths, patterns, types and required keys', () => {
    const doc = defaults();
    doc.navigation.sidebar[0].label = 'x'.repeat(41);
    doc.theme.highlight = 'lime';
    doc.features.purchases = 'yes';
    delete doc.copy.courseLocked;
    const result = validateUiConfig(doc);
    expect(result.ok).toBe(false);
    expect(problemAt(doc, '/navigation/sidebar/0/label')).toBe('must be at most 40 characters');
    expect(problemAt(doc, '/theme/highlight')).toMatch(/must match/);
    expect(problemAt(doc, '/features/purchases')).toBe('must be boolean');
    expect(problemAt(doc, '/copy/courseLocked')).toBe('is required');
  });

  it('allows null where the schema says so', () => {
    const doc = defaults();
    doc.branding.logoUrl = null;
    doc.navigation.sidebar[2].href = null;
    expect(validateUiConfig(doc).ok).toBe(true);
  });

  it('rejects duplicate nav ids across both sidebar lists', () => {
    const doc = defaults();
    doc.navigation.sidebarBottom = [{ ...doc.navigation.sidebar[0], label: 'Copy' }];
    expect(problemAt(doc, '/navigation/sidebarBottom/0/id')).toMatch(/duplicate id "home"/);
  });

  it('caps array sizes and the whole document', () => {
    const doc = defaults();
    doc.navigation.sidebarBottom = Array.from({ length: 7 }, (_, i) => ({ ...doc.navigation.sidebar[0], id: `x${i}` }));
    expect(problemAt(doc, '/navigation/sidebarBottom')).toBe('must have at most 6 items');

    const huge = defaults();
    huge.copy.courseLocked = 'x'.repeat(MAX_DOCUMENT_BYTES);
    expect(validateUiConfig(huge).problems[0].message).toMatch(/limit is/);
  });

  it('rejects a non-object document and a wrong schemaVersion', () => {
    expect(validateUiConfig(null).ok).toBe(false);
    expect(validateUiConfig([]).problems[0]).toEqual({ path: '/', message: 'must be object' });
    const doc = defaults();
    doc.schemaVersion = 3;
    expect(problemAt(doc, '/schemaVersion')).toMatch(/must be one of/);
  });
});

describe('assertSchemaSupported', () => {
  it('refuses keywords the validator does not implement', () => {
    expect(() => assertSchemaSupported({ type: 'object', properties: { a: { oneOf: [] } } })).toThrow(/unsupported keyword "oneOf"/);
    expect(() => assertSchemaSupported({ additionalProperties: true })).toThrow(/additionalProperties must be false/);
    expect(() => assertSchemaSupported({ $ref: 'https://evil.example/schema' })).toThrow(/only local/);
  });
});

describe('canonicalJson / checksumOf', () => {
  it('ignores key order so an unchanged document keeps its checksum', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"x":0,"y":1}]},"b":1}');
    expect(checksumOf({ a: 1, b: 2 })).toBe(checksumOf({ b: 2, a: 1 }));
    expect(checksumOf({ a: 1 })).not.toBe(checksumOf({ a: 2 }));
  });
});
