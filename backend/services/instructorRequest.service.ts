import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const userSelect = { id: true, name: true, email: true, role: true };

export const getMyRequest = (userId: string) =>
  prisma.instructorRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

export const createRequest = async (userId: string, message?: string) => {
  const existingPending = await prisma.instructorRequest.findFirst({
    where: { userId, status: 'PENDING' },
  });
  if (existingPending) return { ok: false as const, reason: 'ALREADY_PENDING' as const };

  const request = await prisma.instructorRequest.create({
    data: { userId, message: message ?? null },
  });
  return { ok: true as const, request };
};

export const listRequests = (status?: 'PENDING' | 'APPROVED' | 'REJECTED') =>
  prisma.instructorRequest.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    include: { user: { select: userSelect } },
  });

export const approveRequest = async (requestId: string, adminId: string) => {
  const request = await prisma.instructorRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false as const, reason: 'NOT_FOUND' as const };

  // Flip the request and promote the user atomically.
  const [updated] = await prisma.$transaction([
    prisma.instructorRequest.update({
      where: { id: requestId },
      data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
    }),
    prisma.user.update({ where: { id: request.userId }, data: { role: 'INSTRUCTOR' } }),
  ]);
  return { ok: true as const, request: updated };
};

export const rejectRequest = async (requestId: string, adminId: string) => {
  const request = await prisma.instructorRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false as const, reason: 'NOT_FOUND' as const };

  const updated = await prisma.instructorRequest.update({
    where: { id: requestId },
    data: { status: 'REJECTED', reviewedBy: adminId, reviewedAt: new Date() },
  });
  return { ok: true as const, request: updated };
};
