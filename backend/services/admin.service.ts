import { PrismaClient, Prisma, Role } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

export interface ListUsersParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: Role;
}

export const listUsers = async ({ page, limit, search, role }: ListUsersParams = {}) => {
  const take = Math.min(Math.max(limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const safePage = Math.max(page || 1, 1);
  const skip = (safePage - 1) * take;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page: safePage, limit: take, totalPages: Math.ceil(total / take) };
};

export const setUserRole = (userId: string, role: Role) =>
  prisma.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, name: true, email: true, role: true },
  });
