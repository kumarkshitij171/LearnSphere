import { mockDeep } from 'jest-mock-extended';

// Auto-applied mock for @prisma/client. Every `new PrismaClient()` returns the
// same deep mock, so a stub set in one place applies across services/controllers.
const prismaMock = mockDeep();

export const PrismaClient = jest.fn(() => prismaMock);
export const Prisma = {};

// Runtime enum objects (used via Object.values in controllers).
export const Role = { STUDENT: 'STUDENT', INSTRUCTOR: 'INSTRUCTOR', ADMIN: 'ADMIN' };
export const InstructorRequestStatus = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };
export const VideoStatus = { UPLOADED: 'UPLOADED', TRANSCODING: 'TRANSCODING', READY: 'READY', FAILED: 'FAILED' };
export const EnrollmentSource = { PURCHASE: 'PURCHASE', FREE: 'FREE', ADMIN_GRANT: 'ADMIN_GRANT', INSTRUCTOR: 'INSTRUCTOR' };

export default { PrismaClient, Prisma, Role, InstructorRequestStatus, VideoStatus, EnrollmentSource };
