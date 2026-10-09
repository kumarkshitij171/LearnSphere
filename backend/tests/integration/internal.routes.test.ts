import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { buildTestApp } from '../helpers/testApp';

const app = buildTestApp();
const prisma: any = new PrismaClient();

const KEY = process.env.INTERNAL_API_KEY!;

const course = {
  id: 'c1',
  title: 'Kafka for Beginners',
  price: 499.99,
  currency: 'INR',
  isPublished: true,
  instructorId: 'i1',
};

describe('GET /internal/courses/:courseId', () => {
  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/v1/internal/courses/c1');
    expect(res.status).toBe(401);
    expect(prisma.course.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a user session cookie — this route is service-to-service only', async () => {
    const res = await request(app)
      .get('/api/v1/internal/courses/c1')
      .set('Cookie', 'access_token=whatever');
    expect(res.status).toBe(401);
  });

  it('returns the catalogue snapshot with amountMinor', async () => {
    prisma.course.findUnique.mockResolvedValue(course);
    const res = await request(app)
      .get('/api/v1/internal/courses/c1')
      .set('X-Internal-Api-Key', KEY);

    expect(res.status).toBe(200);
    expect(res.body.course).toEqual({ ...course, amountMinor: 49999 });
  });

  it('selects only the fields an order snapshots', async () => {
    prisma.course.findUnique.mockResolvedValue(course);
    await request(app).get('/api/v1/internal/courses/c1').set('X-Internal-Api-Key', KEY);

    const args = prisma.course.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'c1' });
    expect(Object.keys(args.select).sort()).toEqual(
      ['currency', 'id', 'instructorId', 'isPublished', 'price', 'title'].sort()
    );
  });

  it('reports a free course as amountMinor 0', async () => {
    prisma.course.findUnique.mockResolvedValue({ ...course, price: 0 });
    const res = await request(app)
      .get('/api/v1/internal/courses/c1')
      .set('X-Internal-Api-Key', KEY);
    expect(res.body.course.amountMinor).toBe(0);
  });

  it('surfaces an unpublished course rather than hiding it — the caller decides', async () => {
    prisma.course.findUnique.mockResolvedValue({ ...course, isPublished: false });
    const res = await request(app)
      .get('/api/v1/internal/courses/c1')
      .set('X-Internal-Api-Key', KEY);
    expect(res.status).toBe(200);
    expect(res.body.course.isPublished).toBe(false);
  });

  it('404s an unknown course', async () => {
    prisma.course.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/internal/courses/nope')
      .set('X-Internal-Api-Key', KEY);
    expect(res.status).toBe(404);
  });
});

describe('GET /internal/enrollments/:userId/:courseId', () => {
  const enrollment = {
    id: 'e1',
    orderId: 'o1',
    source: 'PURCHASE',
    enrolledAt: new Date('2026-09-01T00:00:00.000Z'),
    revokedAt: null,
  };

  it('rejects an unauthenticated caller with 401', async () => {
    const res = await request(app).get('/api/v1/internal/enrollments/u1/c1');
    expect(res.status).toBe(401);
    expect(prisma.enrollment.findUnique).not.toHaveBeenCalled();
  });

  it('reports an active enrolment as enrolled', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(enrollment);
    const res = await request(app)
      .get('/api/v1/internal/enrollments/u1/c1')
      .set('X-Internal-Api-Key', KEY);

    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(true);
    expect(res.body.enrollment.orderId).toBe('o1');
  });

  it('reports a revoked enrolment as NOT enrolled so a refunded buyer can re-purchase', async () => {
    prisma.enrollment.findUnique.mockResolvedValue({
      ...enrollment,
      revokedAt: new Date('2026-09-10T00:00:00.000Z'),
    });
    const res = await request(app)
      .get('/api/v1/internal/enrollments/u1/c1')
      .set('X-Internal-Api-Key', KEY);

    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(false);
    // still returned — the caller may want to say "you were refunded on ..."
    expect(res.body.enrollment).not.toBeNull();
  });

  it('reports no row as not enrolled, with a null enrollment', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .get('/api/v1/internal/enrollments/u1/c1')
      .set('X-Internal-Api-Key', KEY);

    expect(res.status).toBe(200);
    expect(res.body.enrolled).toBe(false);
    expect(res.body.enrollment).toBeNull();
  });

  it('looks up by the (userId, courseId) compound unique key', async () => {
    prisma.enrollment.findUnique.mockResolvedValue(null);
    await request(app)
      .get('/api/v1/internal/enrollments/u1/c1')
      .set('X-Internal-Api-Key', KEY);

    expect(prisma.enrollment.findUnique.mock.calls[0][0].where).toEqual({
      userId_courseId: { userId: 'u1', courseId: 'c1' },
    });
  });
});
