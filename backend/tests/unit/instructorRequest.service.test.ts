import { PrismaClient } from '@prisma/client';
import { createRequest, approveRequest } from '../../services/instructorRequest.service';

const prisma: any = new PrismaClient();

describe('createRequest', () => {
  it('rejects a second pending request', async () => {
    prisma.instructorRequest.findFirst.mockResolvedValue({ id: 'r0', status: 'PENDING' });
    const res = await createRequest('u1');
    expect(res.ok).toBe(false);
  });

  it('creates a request when none is pending', async () => {
    prisma.instructorRequest.findFirst.mockResolvedValue(null);
    prisma.instructorRequest.create.mockResolvedValue({ id: 'r1', status: 'PENDING' });
    const res = await createRequest('u1', 'please');
    expect(res.ok).toBe(true);
  });
});

describe('approveRequest', () => {
  it('promotes the user to INSTRUCTOR atomically', async () => {
    prisma.instructorRequest.findUnique.mockResolvedValue({ id: 'r1', userId: 'u1' });
    prisma.$transaction.mockResolvedValue([{ id: 'r1', status: 'APPROVED' }, { id: 'u1', role: 'INSTRUCTOR' }]);

    const res = await approveRequest('r1', 'admin-1');

    expect(res.ok).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // the two writes passed to the transaction
    expect(prisma.instructorRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' }, data: expect.objectContaining({ status: 'APPROVED', reviewedBy: 'admin-1' }) })
    );
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { role: 'INSTRUCTOR' } });
  });

  it('returns not-found for a missing request', async () => {
    prisma.instructorRequest.findUnique.mockResolvedValue(null);
    const res = await approveRequest('missing', 'admin-1');
    expect(res.ok).toBe(false);
  });
});
