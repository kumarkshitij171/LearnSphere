import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { ChangeRoleDto, RejectCourseDto, RejectInstructorDto, CreateCouponDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
    constructor(private prisma: PrismaService, private kafka: KafkaService) {}

    // ── Users ────────────────────────────────────────────────────────────────

    async listUsers(page = 1, limit = 20, role?: string, search?: string) {
        const where: any = {};
        if (role) where.role = role;
        if (search) where.OR = [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
        ];

        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                where, skip: (page - 1) * limit, take: limit,
                select: { id: true, name: true, email: true, role: true, isBanned: true, createdAt: true },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.user.count({ where }),
        ]);

        return { users, total, page, limit };
    }

    async changeRole(userId: string, dto: ChangeRoleDto) {
        return this.prisma.user.update({ where: { id: userId }, data: { role: dto.role } });
    }

    async toggleBan(userId: string, ban: boolean) {
        return this.prisma.user.update({ where: { id: userId }, data: { isBanned: ban } });
    }

    async deleteUser(userId: string) {
        await this.prisma.user.update({ where: { id: userId }, data: { isBanned: true, email: `deleted_${userId}@deleted.com` } });
    }

    // ── Instructor Approval ──────────────────────────────────────────────────

    async listPendingInstructors() {
        return this.prisma.instructorProfile.findMany({
            where: { isApproved: false, rejectionReason: null },
            include: { user: { select: { name: true, email: true, createdAt: true } } },
        });
    }

    async approveInstructor(profileId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { id: profileId } });
        if (!profile) throw new NotFoundException('Profile not found');

        await this.prisma.instructorProfile.update({ where: { id: profileId }, data: { isApproved: true } });
        await this.prisma.user.update({ where: { id: profile.userId }, data: { role: 'INSTRUCTOR' } });

        await this.kafka.emit('instructor.approved', profile.userId, { userId: profile.userId });
    }

    async rejectInstructor(profileId: string, dto: RejectInstructorDto) {
        const profile = await this.prisma.instructorProfile.update({
            where: { id: profileId },
            data: { rejectionReason: dto.reason },
        });

        await this.kafka.emit('instructor.rejected', profile.userId, { userId: profile.userId, reason: dto.reason });
    }

    // ── Course Moderation ────────────────────────────────────────────────────

    async listCourses(status?: string) {
        return this.prisma.course.findMany({
            where: status ? { status: status as any } : undefined,
            include: {
                instructor: { include: { user: { select: { name: true, email: true } } } },
                category: true,
            },
            orderBy: { updatedAt: 'desc' },
        });
    }

    async publishCourse(courseId: string) {
        const course = await this.prisma.course.update({
            where: { id: courseId },
            data: { status: 'PUBLISHED', adminFeedback: null },
            include: { instructor: true },
        });

        await this.kafka.emit('course.published', course.instructor.userId, {
            courseId, instructorId: course.instructor.userId,
        });

        return course;
    }

    async rejectCourse(courseId: string, dto: RejectCourseDto) {
        const course = await this.prisma.course.update({
            where: { id: courseId },
            data: { status: 'DRAFT', adminFeedback: dto.feedback },
            include: { instructor: true },
        });

        await this.kafka.emit('course.rejected', course.instructor.userId, {
            courseId, feedback: dto.feedback, instructorId: course.instructor.userId,
        });

        return course;
    }

    async archiveCourse(courseId: string) {
        return this.prisma.course.update({ where: { id: courseId }, data: { status: 'ARCHIVED' } });
    }

    // ── Analytics ────────────────────────────────────────────────────────────

    async getPlatformStats() {
        const [userCount, courseCount, orderAgg, topCourses, topInstructors] = await Promise.all([
            this.prisma.user.count(),
            this.prisma.course.count({ where: { status: 'PUBLISHED' } }),
            this.prisma.order.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
            this.prisma.course.findMany({
                where: { status: 'PUBLISHED' }, orderBy: { totalStudents: 'desc' }, take: 5,
                select: { id: true, title: true, totalStudents: true, rating: true },
            }),
            this.prisma.instructorProfile.findMany({
                orderBy: { totalRevenue: 'desc' }, take: 5,
                include: { user: { select: { name: true, email: true } } },
            }),
        ]);

        return {
            totalUsers: userCount,
            publishedCourses: courseCount,
            grossMerchandiseValue: orderAgg._sum.amount ?? 0,
            topCourses,
            topInstructors,
        };
    }

    // ── Coupons ──────────────────────────────────────────────────────────────

    async createCoupon(dto: CreateCouponDto) {
        return this.prisma.coupon.create({
            data: {
                ...dto,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
            },
        });
    }

    // ── Instructor Analytics ─────────────────────────────────────────────────

    async getInstructorAnalytics(userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({
            where: { userId },
            include: { courses: { where: { status: 'PUBLISHED' } } },
        });
        if (!profile) throw new NotFoundException('Instructor profile not found');

        const courseIds = profile.courses.map(c => c.id);

        const [orderAgg, enrollmentsByDay] = await Promise.all([
            this.prisma.order.aggregate({
                where: { courseId: { in: courseIds }, status: 'COMPLETED' },
                _sum: { amount: true, instructorRevenue: true, platformRevenue: true },
                _count: { id: true },
            }),
            this.prisma.enrollment.groupBy({
                by: ['createdAt'],
                where: { courseId: { in: courseIds } },
                _count: { id: true },
            }),
        ]);

        return {
            totalStudents: profile.totalStudents,
            totalRevenue: profile.totalRevenue,
            totalOrders: orderAgg._count.id,
            grossRevenue: orderAgg._sum.amount ?? 0,
            instructorRevenue: orderAgg._sum.instructorRevenue ?? 0,
            platformRevenue: orderAgg._sum.platformRevenue ?? 0,
            publishedCourses: profile.courses.length,
            courses: profile.courses,
        };
    }
}
