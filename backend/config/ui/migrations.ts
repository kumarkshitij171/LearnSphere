// Upgrades a stored document to the current schemaVersion on read and on seed. Additive changes
// (a new optional key with a default) need no entry here; only a breaking change bumps the version.
export const CURRENT_SCHEMA_VERSION = 1;

type Migration = (doc: any) => any;

const MIGRATIONS: Record<number, Migration> = {
  // 1: (doc) => ({ ...doc, schemaVersion: 2, ... }),   // v1 -> v2, when it exists
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
