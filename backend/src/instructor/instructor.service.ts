import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstructorService {
    constructor(private prisma: PrismaService) {}

    async getDashboard(userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({
            where: { userId },
            include: {
                courses: {
                    orderBy: { createdAt: 'desc' },
                    include: { category: true, _count: { select: { enrollments: true } } },
                },
            },
        });
        if (!profile) throw new NotFoundException('Instructor profile not found');

        const courseIds = profile.courses.map(c => c.id);

        const [orderAgg, reviewAgg] = await Promise.all([
            this.prisma.order.aggregate({
                where: { courseId: { in: courseIds }, status: 'COMPLETED' },
                _sum: { instructorRevenue: true },
                _count: { id: true },
            }),
            this.prisma.review.aggregate({
                where: { courseId: { in: courseIds } },
                _avg: { rating: true },
                _count: { id: true },
            }),
        ]);

        return {
            totalStudents: profile.totalStudents,
            totalRevenue: profile.totalRevenue,
            totalOrders: orderAgg._count.id,
            instructorRevenue: orderAgg._sum.instructorRevenue ?? 0,
            averageRating: reviewAgg._avg.rating ?? 0,
            totalReviews: reviewAgg._count.id,
            publishedCourses: profile.courses.filter(c => c.status === 'PUBLISHED').length,
            totalCourses: profile.courses.length,
            courses: profile.courses,
        };
    }

    async getCourseAnalytics(courseId: string, userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        if (!profile) throw new NotFoundException('Instructor profile not found');

        const course = await this.prisma.course.findFirst({
            where: { id: courseId, instructorId: profile.id },
            include: {
                sections: {
                    include: {
                        lessons: {
                            include: { progress: { where: { isCompleted: true } } },
                        },
                    },
                },
            },
        });
        if (!course) throw new NotFoundException('Course not found');

        const totalEnrollments = await this.prisma.enrollment.count({ where: { courseId } });

        const enrollmentsByDay = await this.prisma.enrollment.groupBy({
            by: ['createdAt'],
            where: { courseId },
            _count: { id: true },
            orderBy: { createdAt: 'asc' },
        });

        const revenueAgg = await this.prisma.order.aggregate({
            where: { courseId, status: 'COMPLETED' },
            _sum: { amount: true, instructorRevenue: true, platformRevenue: true },
            _count: { id: true },
        });

        const ratingDistribution = await this.prisma.review.groupBy({
            by: ['rating'],
            where: { courseId },
            _count: { id: true },
        });

        // Lesson completion rates
        const lessonStats = course.sections.flatMap(s =>
            s.lessons.map(l => ({
                lessonId: l.id,
                title: l.title,
                completions: l.progress.length,
                completionRate: totalEnrollments > 0
                    ? Math.round((l.progress.length / totalEnrollments) * 100)
                    : 0,
            })),
        );

        return {
            courseId,
            title: course.title,
            totalEnrollments,
            enrollmentsByDay: enrollmentsByDay.map(e => ({
                date: e.createdAt,
                count: e._count.id,
            })),
            revenue: {
                gross: revenueAgg._sum.amount ?? 0,
                instructor: revenueAgg._sum.instructorRevenue ?? 0,
                platform: revenueAgg._sum.platformRevenue ?? 0,
                orders: revenueAgg._count.id,
            },
            ratingDistribution: ratingDistribution.map(r => ({
                rating: r.rating,
                count: r._count.id,
            })),
            lessonStats,
        };
    }

    async getCourseStudents(courseId: string, userId: string, page = 1, limit = 20) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        if (!profile) throw new NotFoundException('Instructor profile not found');

        const owned = await this.prisma.course.findFirst({
            where: { id: courseId, instructorId: profile.id },
        });
        if (!owned) throw new NotFoundException('Course not found');

        const [enrollments, total] = await Promise.all([
            this.prisma.enrollment.findMany({
                where: { courseId },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    user: { select: { id: true, name: true, email: true, avatar: true } },
                    lessonProgress: { where: { isCompleted: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.enrollment.count({ where: { courseId } }),
        ]);

        const totalLessons = await this.prisma.lesson.count({
            where: { section: { courseId } },
        });

        return {
            students: enrollments.map(e => ({
                ...e.user,
                enrolledAt: e.createdAt,
                completedLessons: e.lessonProgress.length,
                progressPercent: totalLessons > 0
                    ? Math.round((e.lessonProgress.length / totalLessons) * 100)
                    : 0,
            })),
            total,
            page,
            limit,
        };
    }

    async getUnansweredQuestions(userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        if (!profile) throw new NotFoundException('Instructor profile not found');

        const courseIds = (await this.prisma.course.findMany({
            where: { instructorId: profile.id },
            select: { id: true },
        })).map(c => c.id);

        return this.prisma.lessonQuestion.findMany({
            where: {
                lesson: { section: { courseId: { in: courseIds } } },
                answers: { none: { isInstructorAnswer: true } },
            },
            include: {
                user: { select: { name: true, avatar: true } },
                lesson: { select: { title: true, section: { select: { course: { select: { title: true } } } } } },
                _count: { select: { answers: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
}
