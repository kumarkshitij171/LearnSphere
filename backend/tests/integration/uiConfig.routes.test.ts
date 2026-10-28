import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { buildTestApp } from '../helpers/testApp';
import { generateAccessToken } from '../../services/user.service';
import { checksumOf } from '../../utils/canonicalJson';

const app = buildTestApp();
const prisma: any = new PrismaClient();

const cookie = (role: string, id = 'admin-1') =>
  `access_token=${generateAccessToken({ id, email: `${id}@x.com`, role, name: id } as any)}`;
const ADMIN = cookie('ADMIN');

const defaults = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, '../../config/ui/ui-config.default.json'), 'utf8'));

const versionRow = (version: number, config = defaults()) => ({
  version,
  config,
  checksum: checksumOf(config),
  message: `v${version}`,
  schemaVersion: 2,
});

beforeEach(() => {
  // interactive transactions run their callback against the same mock
  prisma.$transaction.mockImplementation((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
});

describe('GET /api/v1/ui-config (public)', () => {
  it('serves the published version with an ETag and cache headers, no auth needed', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 3 });
    prisma.uiConfigVersion.findMany.mockResolvedValue([versionRow(3)]);

    const res = await request(app).get('/api/v1/ui-config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, version: 3, fallback: false });
    expect(res.body.config.branding.appName).toBe('LearnSphere');
    expect(res.headers.etag).toBe(`"${checksumOf(defaults())}"`);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('answers 304 when the client already has this version', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 3 });
    prisma.uiConfigVersion.findMany.mockResolvedValue([versionRow(3)]);
    const res = await request(app).get('/api/v1/ui-config').set('If-None-Match', `"${checksumOf(defaults())}"`);
    expect(res.status).toBe(304);
  });

  it('skips an invalid published version for the newest valid one', async () => {
    const broken = { ...defaults(), injected: '<script>' };
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 4 });
    prisma.uiConfigVersion.findMany.mockResolvedValue([versionRow(4, broken), versionRow(3)]);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app).get('/api/v1/ui-config');
    expect(res.body.version).toBe(3);
  });

  it('falls back to the checked-in default when the database has nothing', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/ui-config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ version: 0, fallback: true });
    expect(res.body.config).toEqual(defaults());
  });
});

describe('reads come straight from the database', () => {
  it('serves a newly published version on the very next request — nothing is held in memory', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 3 });
    prisma.uiConfigVersion.findMany.mockResolvedValue([versionRow(3)]);
    expect((await request(app).get('/api/v1/ui-config')).body.version).toBe(3);

    const next = defaults();
    next.branding.tagline = 'Just published';
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 4 });
    prisma.uiConfigVersion.findMany.mockResolvedValue([versionRow(4, next)]);
    const res = await request(app).get('/api/v1/ui-config');
    expect(res.body.version).toBe(4);
    expect(res.body.config.branding.tagline).toBe('Just published');
    expect(prisma.uiConfigState.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('admin routes are ADMIN only', () => {
  const routes: Array<[string, string]> = [
    ['get', '/api/v1/admin/ui-config'],
    ['get', '/api/v1/admin/ui-config/schema'],
    ['get', '/api/v1/admin/ui-config/versions'],
    ['get', '/api/v1/admin/ui-config/versions/1'],
    ['put', '/api/v1/admin/ui-config/draft'],
    ['delete', '/api/v1/admin/ui-config/draft'],
    ['post', '/api/v1/admin/ui-config/validate'],
    ['post', '/api/v1/admin/ui-config/publish'],
    ['post', '/api/v1/admin/ui-config/rollback'],
  ];

  it.each(routes)('%s %s rejects students, instructors and anonymous callers', async (method, url) => {
    for (const role of ['STUDENT', 'INSTRUCTOR']) {
      const res = await (request(app) as any)[method](url).set('Cookie', cookie(role, 'u1')).send({});
      expect(res.status).toBe(403);
    }
    const anonymous = await (request(app) as any)[method](url).send({});
    expect(anonymous.status).toBe(401);
  });
});

describe('admin editing', () => {
  it('returns the published version and the caller\'s draft', async () => {
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 2 });
    prisma.uiConfigVersion.findUnique.mockResolvedValue({ ...versionRow(2), createdBy: { id: 'a', name: 'Asha' } });
    prisma.uiConfigDraft.findUnique.mockResolvedValue({ authorId: 'admin-1', baseVersion: 2, config: defaults() });
    const res = await request(app).get('/api/v1/admin/ui-config').set('Cookie', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.published.version).toBe(2);
    expect(res.body.draft.baseVersion).toBe(2);
    expect(prisma.uiConfigDraft.findUnique.mock.calls[0][0]).toEqual({ where: { authorId: 'admin-1' } });
  });

  it('serves the schema for the editor', async () => {
    const res = await request(app).get('/api/v1/admin/ui-config/schema').set('Cookie', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('LearnSphere UI configuration');
  });

  it('saves an invalid draft but reports its problems', async () => {
    const doc = defaults();
    doc.navigation.sidebar[0].href = 'javascript:void(0)';
    prisma.uiConfigDraft.upsert.mockResolvedValue({ authorId: 'admin-1', baseVersion: 2, config: doc });
    const res = await request(app).put('/api/v1/admin/ui-config/draft').set('Cookie', ADMIN).send({ baseVersion: 2, config: doc });
    expect(res.status).toBe(200);
    expect(res.body.problems).toEqual([expect.objectContaining({ path: '/navigation/sidebar/0/href' })]);
  });

  it('validates without saving', async () => {
    const res = await request(app).post('/api/v1/admin/ui-config/validate').set('Cookie', ADMIN).send({ config: defaults() });
    expect(res.body).toMatchObject({ ok: true, problems: [] });
    expect(prisma.uiConfigDraft.upsert).not.toHaveBeenCalled();
  });

  it('publishes a valid draft as base+1 and deletes the draft, in one transaction', async () => {
    const doc = defaults();
    doc.branding.tagline = 'New tagline';
    prisma.uiConfigDraft.findUnique.mockResolvedValue({ authorId: 'admin-1', baseVersion: 2, config: doc });
    prisma.uiConfigState.updateMany.mockResolvedValue({ count: 1 });
    prisma.uiConfigVersion.create.mockResolvedValue({});
    prisma.uiConfigDraft.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app).post('/api/v1/admin/ui-config/publish').set('Cookie', ADMIN)
      .send({ baseVersion: 2, message: 'New tagline' });
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(3);
    expect(prisma.uiConfigState.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'ui', publishedVersion: 2 },
      data: { publishedVersion: 3 },
    });
    expect(prisma.uiConfigVersion.create.mock.calls[0][0].data).toMatchObject({
      version: 3, basedOn: 2, message: 'New tagline', createdById: 'admin-1', checksum: checksumOf(doc),
    });
    expect(prisma.uiConfigDraft.deleteMany).toHaveBeenCalledWith({ where: { authorId: 'admin-1' } });
  });

  it('refuses a stale base with 409 and the current version', async () => {
    prisma.uiConfigDraft.findUnique.mockResolvedValue({ authorId: 'admin-1', baseVersion: 2, config: defaults() });
    prisma.uiConfigState.updateMany.mockResolvedValue({ count: 0 });
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 5 });

    const res = await request(app).post('/api/v1/admin/ui-config/publish').set('Cookie', ADMIN)
      .send({ baseVersion: 2, message: 'late publish' });
    expect(res.status).toBe(409);
    expect(res.body.currentVersion).toBe(5);
    expect(prisma.uiConfigVersion.create).not.toHaveBeenCalled();
  });

  it('refuses to publish an invalid draft, listing the problems', async () => {
    const doc = defaults();
    doc.theme.highlight = 'red';
    prisma.uiConfigDraft.findUnique.mockResolvedValue({ authorId: 'admin-1', baseVersion: 2, config: doc });
    const res = await request(app).post('/api/v1/admin/ui-config/publish').set('Cookie', ADMIN)
      .send({ baseVersion: 2, message: 'broken theme' });
    expect(res.status).toBe(400);
    expect(res.body.problems[0].path).toBe('/theme/highlight');
    expect(prisma.uiConfigState.updateMany).not.toHaveBeenCalled();
  });

  it('requires a message and an existing draft', async () => {
    const noMessage = await request(app).post('/api/v1/admin/ui-config/publish').set('Cookie', ADMIN).send({ baseVersion: 2 });
    expect(noMessage.status).toBe(400);
    prisma.uiConfigDraft.findUnique.mockResolvedValue(null);
    const noDraft = await request(app).post('/api/v1/admin/ui-config/publish').set('Cookie', ADMIN)
      .send({ baseVersion: 2, message: 'nothing here' });
    expect(noDraft.status).toBe(404);
  });

  it('rolls back by publishing the old document as a new version', async () => {
    const old = defaults();
    old.branding.tagline = 'The old one';
    prisma.uiConfigVersion.findUnique.mockResolvedValue(versionRow(1, old));
    prisma.uiConfigState.findUnique.mockResolvedValue({ id: 'ui', publishedVersion: 4 });
    prisma.uiConfigState.updateMany.mockResolvedValue({ count: 1 });
    prisma.uiConfigVersion.create.mockResolvedValue({});

    const res = await request(app).post('/api/v1/admin/ui-config/rollback').set('Cookie', ADMIN)
      .send({ toVersion: 1, message: 'Back to the original tagline' });
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(5);
    expect(prisma.uiConfigVersion.create.mock.calls[0][0].data).toMatchObject({
      version: 5, rollbackOf: 1, basedOn: 4, config: old,
    });
  });

  it('404s an unknown version', async () => {
    prisma.uiConfigVersion.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/admin/ui-config/versions/99').set('Cookie', ADMIN);
    expect(res.status).toBe(404);
  });
});
