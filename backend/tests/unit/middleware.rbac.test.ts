import { PrismaClient } from '@prisma/client';
import { authorizedRoles } from '../../middleware/auth';
import { requireCourseOwner } from '../../middleware/ownership';

const prisma: any = new PrismaClient();

const run = (mw: any, req: any) =>
  new Promise<any>((resolve) => mw(req, {} as any, (err?: any) => resolve(err)));

describe('authorizedRoles', () => {
  it('lets an allowed role through', async () => {
    const err = await run(authorizedRoles('INSTRUCTOR'), { user: { role: 'INSTRUCTOR' } });
    expect(err).toBeUndefined();
  });

  it('blocks a disallowed role with 403', async () => {
    const err = await run(authorizedRoles('INSTRUCTOR'), { user: { role: 'STUDENT' } });
    expect(err.statusCode).toBe(403);
  });

  it('lets ADMIN through any gate (short-circuit)', async () => {
    const err = await run(authorizedRoles('INSTRUCTOR'), { user: { role: 'ADMIN' } });
    expect(err).toBeUndefined();
  });
});

describe('requireCourseOwner', () => {
  it('allows the course owner and attaches req.course', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'u1' });
    const req: any = { params: { courseId: 'c1' }, body: {}, user: { id: 'u1', role: 'INSTRUCTOR' } };
    const err = await run(requireCourseOwner, req);
    expect(err).toBeUndefined();
    expect(req.course.id).toBe('c1');
  });

  it('allows an admin who is not the owner', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'someone-else' });
    const req: any = { params: { courseId: 'c1' }, body: {}, user: { id: 'admin', role: 'ADMIN' } };
    expect(await run(requireCourseOwner, req)).toBeUndefined();
  });

  it('rejects a non-owner instructor with 403', async () => {
    prisma.course.findUnique.mockResolvedValue({ id: 'c1', instructorId: 'other' });
    const req: any = { params: { courseId: 'c1' }, body: {}, user: { id: 'u1', role: 'INSTRUCTOR' } };
    const err = await run(requireCourseOwner, req);
    expect(err.statusCode).toBe(403);
  });

  it('404s when the course does not exist', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    const req: any = { params: { courseId: 'missing' }, body: {}, user: { id: 'u1', role: 'INSTRUCTOR' } };
    const err = await run(requireCourseOwner, req);
    expect(err.statusCode).toBe(404);
  });

  it('400s when no courseId is provided', async () => {
    const req: any = { params: {}, body: {}, user: { id: 'u1', role: 'INSTRUCTOR' } };
    const err = await run(requireCourseOwner, req);
    expect(err.statusCode).toBe(400);
  });
});
