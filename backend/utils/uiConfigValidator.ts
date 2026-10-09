import fs from 'fs';
import path from 'path';

// A validator for the subset of JSON Schema (draft-07) that config/ui/ui-config.schema.json uses.
// The schema file stays standard, so the admin editor (Monaco) reads the same contract; this
// refuses to load a schema that uses a keyword it does not implement, so nothing is silently
// left unchecked.

export interface Problem {
  path: string; // JSON pointer, e.g. /navigation/sidebar/3/href
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  problems: Problem[];
}

type Schema = Record<string, any>;

export const MAX_DOCUMENT_BYTES = 64 * 1024;

const SUPPORTED = new Set([
  'type', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems',
  'minLength', 'maxLength', 'pattern', '$ref',
]);
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', 'default', 'definitions', 'examples']);

export const SCHEMA_PATH = path.join(__dirname, '../config/ui/ui-config.schema.json');
export const uiConfigSchema: Schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

export const assertSchemaSupported = (schema: Schema, at = ''): void => {
  for (const [key, value] of Object.entries(schema)) {
    if (!SUPPORTED.has(key) && !ANNOTATIONS.has(key)) {
      throw new Error(`ui-config schema uses unsupported keyword "${key}" at ${at || '/'}`);
    }
    if (key === 'properties' || key === 'definitions') {
      for (const [name, sub] of Object.entries(value as Schema)) assertSchemaSupported(sub as Schema, `${at}/${key}/${name}`);
    } else if (key === 'items') {
      assertSchemaSupported(value as Schema, `${at}/items`);
    } else if (key === 'additionalProperties' && value !== false) {
      throw new Error(`ui-config schema: additionalProperties must be false (at ${at || '/'})`);
    } else if (key === '$ref' && !String(value).startsWith('#/definitions/')) {
      throw new Error(`ui-config schema: only local #/definitions refs are supported (at ${at || '/'})`);
    }
  }
};
assertSchemaSupported(uiConfigSchema, '');

const resolve = (schema: Schema): Schema => {
  if (!schema.$ref) return schema;
  const name = String(schema.$ref).slice('#/definitions/'.length);
  const target = uiConfigSchema.definitions?.[name];
  if (!target) throw new Error(`ui-config schema: unresolved $ref ${schema.$ref}`);
  return resolve(target);
};

const typeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
};

const matchesType = (value: unknown, type: string): boolean => {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
};

const escape = (segment: string | number) => String(segment).replace(/~/g, '~0').replace(/\//g, '~1');

const check = (raw: Schema, value: unknown, at: string, problems: Problem[]): void => {
  const schema = resolve(raw);

  if (schema.type !== undefined) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(value, t))) {
      problems.push({ path: at || '/', message: `must be ${types.join(' or ')}` });
      return;
    }
  }
  if (schema.enum && !schema.enum.some((option: unknown) => option === value)) {
    problems.push({ path: at || '/', message: `must be one of: ${schema.enum.map((o: unknown) => JSON.stringify(o)).join(', ')}` });
    return;
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      problems.push({ path: at, message: schema.minLength === 1 ? 'must not be empty' : `must be at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      problems.push({ path: at, message: `must be at most ${schema.maxLength} characters` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      problems.push({ path: at, message: `must match ${schema.pattern}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      problems.push({ path: at, message: `must have at least ${schema.minItems} items` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      problems.push({ path: at, message: `must have at most ${schema.maxItems} items` });
    }
    if (schema.items) value.forEach((item, i) => check(schema.items, item, `${at}/${i}`, problems));
  }

  if (typeOf(value) === 'object') {
    const object = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in object)) problems.push({ path: `${at}/${escape(key)}`, message: 'is required' });
    }
    const properties: Schema = schema.properties ?? {};
    for (const [key, child] of Object.entries(object)) {
      if (properties[key]) check(properties[key], child, `${at}/${escape(key)}`, problems);
      else if (schema.additionalProperties === false) {
        problems.push({ path: `${at}/${escape(key)}`, message: 'is not a known setting' });
      }
    }
  }
};

// Rules JSON Schema draft-07 cannot express.
const crossFieldRules = (doc: any, problems: Problem[]): void => {
  const seen = new Map<string, string>();
  for (const list of ['sidebar', 'sidebarBottom'] as const) {
    const items = doc?.navigation?.[list];
    if (!Array.isArray(items)) continue;
    items.forEach((item: any, i: number) => {
      if (typeof item?.id !== 'string') return;
      const at = `/navigation/${list}/${i}/id`;
      const previous = seen.get(item.id);
      if (previous) problems.push({ path: at, message: `duplicate id "${item.id}" (also at ${previous})` });
      else seen.set(item.id, at);
    });
  }
};

export const validateUiConfig = (doc: unknown): ValidationResult => {
  const problems: Problem[] = [];
  const bytes = Buffer.byteLength(JSON.stringify(doc) ?? '', 'utf8');
  if (bytes > MAX_DOCUMENT_BYTES) {
    return { ok: false, problems: [{ path: '/', message: `document is ${bytes} bytes; the limit is ${MAX_DOCUMENT_BYTES}` }] };
  }
  check(uiConfigSchema, doc, '', problems);
  if (problems.length === 0) crossFieldRules(doc, problems);
  return { ok: problems.length === 0, problems };
};
