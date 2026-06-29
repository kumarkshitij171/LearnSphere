import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { buildTestApp } from '../helpers/testApp';
import { generateAccessToken } from '../../services/user.service';

const app = buildTestApp();
const prisma: any = new PrismaClient();

const adminCookie = (id = 'admin-1') =>
  `access_token=${generateAccessToken({ id, email: `${id}@x.com`, role: 'ADMIN' } as any)}`;

describe('PATCH /admin/users/:id/role', () => {
  it('rejects an admin changing their own role (400)', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/admin-1/role')
      .set('Cookie', adminCookie('admin-1'))
      .send({ role: 'STUDENT' });
    expect(res.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('changes another user role (200)', async () => {
    prisma.user.update.mockResolvedValue({ id: 'u2', role: 'INSTRUCTOR' });
    const res = await request(app)
      .patch('/api/v1/admin/users/u2/role')
      .set('Cookie', adminCookie('admin-1'))
      .send({ role: 'INSTRUCTOR' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('INSTRUCTOR');
  });

  it('rejects an invalid role (400)', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/u2/role')
      .set('Cookie', adminCookie('admin-1'))
      .send({ role: 'WIZARD' });
    expect(res.status).toBe(400);
  });

  it('forbids a non-admin (403)', async () => {
    const studentCookie = `access_token=${generateAccessToken({ id: 's1', email: 's@x.com', role: 'STUDENT' } as any)}`;
    const res = await request(app)
      .patch('/api/v1/admin/users/u2/role')
      .set('Cookie', studentCookie)
      .send({ role: 'INSTRUCTOR' });
    expect(res.status).toBe(403);
  });
});
