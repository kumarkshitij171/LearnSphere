import fs from 'fs';
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { validateUiConfig, Problem } from '../utils/uiConfigValidator';
import { checksumOf } from '../utils/canonicalJson';
import { CURRENT_SCHEMA_VERSION, migrateUiConfig } from '../config/ui/migrations';

const prisma = new PrismaClient();

const STATE_ID = 'ui';
const FALLBACK_SCAN = 20;

export const DEFAULT_PATH = path.join(__dirname, '../config/ui/ui-config.default.json');

export interface PublishedConfig {
  version: number;
  checksum: string;
  config: Record<string, unknown>;
  // true when the database had nothing valid and the checked-in default is being served
  fallback: boolean;
}

export class StaleBaseError extends Error {
  constructor(public currentVersion: number) {
    super(`Published config moved to v${currentVersion}`);
  }
}

export class InvalidConfigError extends Error {
  constructor(public problems: Problem[]) {
    super('The configuration is not valid');
  }
}

export const readDefaultConfig = (): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(DEFAULT_PATH, 'utf8'));

const asDocument = (stored: Prisma.JsonValue) => migrateUiConfig(stored) as Record<string, unknown>;

/**
 * The live document, read from the database on every call — no in-process copy, so every replica
 * serves a publish the moment it commits. A stored version that no longer validates is skipped for
 * the newest one that does; with none, the checked-in default is served, so users never get a
 * broken UI from config.
 */
export const getPublished = async (): Promise<PublishedConfig> => {
  const state = await prisma.uiConfigState.findUnique({ where: { id: STATE_ID } });
  let value: PublishedConfig | null = null;
  if (state) {
    const candidates = await prisma.uiConfigVersion.findMany({
      where: { version: { lte: state.publishedVersion } },
      orderBy: { version: 'desc' },
      take: FALLBACK_SCAN,
    });
    for (const row of candidates) {
      try {
        const config = asDocument(row.config);
        if (validateUiConfig(config).ok) {
          if (row.version !== state.publishedVersion) {
            console.error(`[ui-config] ALERT published v${state.publishedVersion} is invalid; serving v${row.version}`);
          }
          value = { version: row.version, checksum: row.checksum, config, fallback: false };
          break;
        }
      } catch (error) {
        console.error(`[ui-config] ALERT v${row.version} could not be migrated:`, error);
      }
    }
  }
  if (!value) {
    const config = readDefaultConfig();
    value = { version: 0, checksum: checksumOf(config), config, fallback: true };
  }
  return value;
};

/** Creates v1 from the checked-in default when the database has never held a UI config. */
export const ensureUiConfigSeeded = async (): Promise<boolean> => {
  if (await prisma.uiConfigState.findUnique({ where: { id: STATE_ID } })) return false;
  const config = readDefaultConfig();
  const result = validateUiConfig(config);
  if (!result.ok) throw new InvalidConfigError(result.problems);
  try {
    await prisma.$transaction([
      prisma.uiConfigVersion.create({
        data: {
          version: 1,
          config: config as Prisma.InputJsonValue,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          checksum: checksumOf(config),
          message: 'seeded from config/ui/ui-config.default.json',
        },
      }),
      prisma.uiConfigState.create({ data: { id: STATE_ID, publishedVersion: 1 } }),
    ]);
  } catch (error) {
    // another replica seeded first
    if ((error as { code?: string })?.code === 'P2002') return false;
    throw error;
  }
  return true;
};

const versionSelect = {
  version: true,
  message: true,
  checksum: true,
  basedOn: true,
  rollbackOf: true,
  schemaVersion: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const;

export const getAdminView = async (authorId: string) => {
  const state = await prisma.uiConfigState.findUnique({ where: { id: STATE_ID } });
  const published = state
    ? await prisma.uiConfigVersion.findUnique({
        where: { version: state.publishedVersion },
        select: { ...versionSelect, config: true },
      })
    : null;
  const draft = await prisma.uiConfigDraft.findUnique({ where: { authorId } });
  return { published, draft };
};

export const listVersions = async (page = 1, limit = 30) => {
  const take = Math.min(Math.max(limit, 1), 100);
  const skip = (Math.max(page, 1) - 1) * take;
  const [versions, total] = await Promise.all([
    prisma.uiConfigVersion.findMany({ orderBy: { version: 'desc' }, skip, take, select: versionSelect }),
    prisma.uiConfigVersion.count(),
  ]);
  const state = await prisma.uiConfigState.findUnique({ where: { id: STATE_ID } });
  return { versions, total, page: Math.max(page, 1), limit: take, publishedVersion: state?.publishedVersion ?? null };
};

export const getVersion = (version: number) =>
  prisma.uiConfigVersion.findUnique({ where: { version }, select: { ...versionSelect, config: true } });

/** Drafts may be invalid while being edited; problems are returned, publishing is what refuses. */
export const saveDraft = async (authorId: string, baseVersion: number, config: unknown) => {
  const draft = await prisma.uiConfigDraft.upsert({
    where: { authorId },
    update: { baseVersion, config: config as Prisma.InputJsonValue },
    create: { authorId, baseVersion, config: config as Prisma.InputJsonValue },
  });
  return { draft, problems: validateUiConfig(config).problems };
};

export const discardDraft = (authorId: string) => prisma.uiConfigDraft.deleteMany({ where: { authorId } });

// Appends version base+1 iff the published version is still `base`: the conditional update is
// the optimistic lock, so two admins publishing from the same base cannot both win.
const appendVersion = async (args: {
  base: number;
  config: unknown;
  message: string;
  createdById: string;
  rollbackOf?: number;
  deleteDraftOf?: string;
}) => {
  const next = args.base + 1;
  await prisma.$transaction(async (tx) => {
    const moved = await tx.uiConfigState.updateMany({
      where: { id: STATE_ID, publishedVersion: args.base },
      data: { publishedVersion: next },
    });
    if (moved.count === 0) {
      const state = await tx.uiConfigState.findUnique({ where: { id: STATE_ID } });
      throw new StaleBaseError(state?.publishedVersion ?? 0);
    }
    await tx.uiConfigVersion.create({
      data: {
        version: next,
        config: args.config as Prisma.InputJsonValue,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        checksum: checksumOf(args.config),
        message: args.message,
        basedOn: args.base,
        rollbackOf: args.rollbackOf ?? null,
        createdById: args.createdById,
      },
    });
    if (args.deleteDraftOf) await tx.uiConfigDraft.deleteMany({ where: { authorId: args.deleteDraftOf } });
  });
  return next;
};

export const publishDraft = async (authorId: string, baseVersion: number, message: string) => {
  const draft = await prisma.uiConfigDraft.findUnique({ where: { authorId } });
  if (!draft) return { ok: false as const, reason: 'NO_DRAFT' as const };
  if (draft.baseVersion !== baseVersion) {
    // the client is looking at a different base than the saved draft: send it the live version
    const state = await prisma.uiConfigState.findUnique({ where: { id: STATE_ID } });
    throw new StaleBaseError(state?.publishedVersion ?? 0);
  }
  const result = validateUiConfig(draft.config);
  if (!result.ok) throw new InvalidConfigError(result.problems);
  const version = await appendVersion({
    base: baseVersion,
    config: draft.config,
    message,
    createdById: authorId,
    deleteDraftOf: authorId,
  });
  return { ok: true as const, version };
};

/** Restoring is publishing an old document as a new version: history is never rewritten. */
export const rollbackTo = async (authorId: string, toVersion: number, message: string) => {
  const [target, state] = await Promise.all([
    prisma.uiConfigVersion.findUnique({ where: { version: toVersion } }),
    prisma.uiConfigState.findUnique({ where: { id: STATE_ID } }),
  ]);
  if (!target || !state) return { ok: false as const, reason: 'NOT_FOUND' as const };
  const config = asDocument(target.config);
  const result = validateUiConfig(config);
  if (!result.ok) throw new InvalidConfigError(result.problems);
  const version = await appendVersion({
    base: state.publishedVersion,
    config,
    message,
    createdById: authorId,
    rollbackOf: toVersion,
  });
  return { ok: true as const, version };
};
