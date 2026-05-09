import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { CertificatesService } from '../certificates/certificates.service';

@Injectable()
export class EnrollmentService {
    constructor(
        private prisma: PrismaService,
        private kafka: KafkaService,
        private certificates: CertificatesService,
    ) {}

    async enrollFree(userId: string, courseId: string) {
        const course = await this.prisma.course.findUnique({ where: { id: courseId } });
        if (!course) throw new NotFoundException('Course not found');
        if (course.price > 0) throw new BadRequestException('This course requires payment');

        return this.enrollFreeInternal(userId, courseId);
    }

    async enrollFreeInternal(userId: string, courseId: string, orderId?: string) {
        const existing = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });
        if (existing) return existing;

        const enrollment = await this.prisma.enrollment.create({
            data: { userId, courseId, ...(orderId ? { orderId } : {}) },
        });
        await this.prisma.course.update({ where: { id: courseId }, data: { totalStudents: { increment: 1 } } });

        const course = await this.prisma.course.findUnique({
            where: { id: courseId }, select: { instructorId: true },
        });
        if (course) {
            await this.prisma.instructorProfile.update({
                where: { id: course.instructorId },
                data: { totalStudents: { increment: 1 } },
            });
        }

        return enrollment;
    }

    async getMyEnrollments(userId: string) {
        return this.prisma.enrollment.findMany({
            where: { userId },
            include: {
                course: {
                    include: {
                        instructor: { include: { user: { select: { name: true, avatar: true } } } },
                    },
                },
                lessonProgress: { where: { isCompleted: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    async getEnrollmentDetail(userId: string, courseId: string) {
        const enrollment = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
            include: {
                course: {
                    include: {
                        sections: {
                            orderBy: { order: 'asc' },
                            include: { lessons: { orderBy: { order: 'asc' } } },
                        },
                    },
                },
                lessonProgress: true,
            },
        });

        if (!enrollment) throw new NotFoundException('Enrollment not found');

        const totalLessons = enrollment.course.sections.reduce((s, sec) => s + sec.lessons.length, 0);
        const completedLessons = enrollment.lessonProgress.filter(p => p.isCompleted).length;
        const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

        return { ...enrollment, progressPercent, totalLessons, completedLessons };
    }

    async markLessonComplete(userId: string, courseId: string, lessonId: string) {
        const enrollment = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });
        if (!enrollment) throw new NotFoundException('Not enrolled');

        const progress = await this.prisma.lessonProgress.upsert({
            where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
            update: { isCompleted: true, completedAt: new Date() },
            create: { enrollmentId: enrollment.id, lessonId, isCompleted: true, completedAt: new Date() },
        });

        await this.checkCompletion(enrollment.id, userId, courseId);
        return progress;
    }

    async saveWatchPosition(userId: string, courseId: string, lessonId: string, watchedSeconds: number) {
        const enrollment = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });
        if (!enrollment) throw new NotFoundException('Not enrolled');

        return this.prisma.lessonProgress.upsert({
            where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
            update: { watchedSeconds },
            create: { enrollmentId: enrollment.id, lessonId, watchedSeconds },
        });
    }

    async getCourseProgress(userId: string, courseId: string) {
        const enrollment = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
            include: {
                course: { include: { sections: { include: { lessons: true } } } },
                lessonProgress: true,
            },
        });

        if (!enrollment) throw new NotFoundException('Not enrolled');

        const totalLessons = enrollment.course.sections.reduce((s, sec) => s + sec.lessons.length, 0);
        const completedLessons = enrollment.lessonProgress.filter(p => p.isCompleted).length;

        return {
            progressPercent: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
            totalLessons,
            completedLessons,
            lessonProgress: enrollment.lessonProgress,
        };
    }

    private async checkCompletion(enrollmentId: string, userId: string, courseId: string) {
        const enrollment = await this.prisma.enrollment.findUnique({
            where: { id: enrollmentId },
            include: {
                course: { include: { sections: { include: { lessons: true } } } },
                lessonProgress: { where: { isCompleted: true } },
            },
        });

        if (!enrollment) return;

        const totalLessons = enrollment.course.sections.reduce((s, sec) => s + sec.lessons.length, 0);
        if (totalLessons > 0 && enrollment.lessonProgress.length >= totalLessons) {
            const existing = await this.prisma.certificate.findUnique({
                where: { userId_courseId: { userId, courseId } },
            });

            if (!existing) {
                const course = await this.prisma.course.findUnique({
                    where: { id: courseId }, select: { title: true },
                });
                // Generate a placeholder PDF URL — replace with a real PDF generator in production
                const pdfUrl = `https://certificates.example.com/${userId}/${courseId}.pdf`;
                const cert = await this.certificates.issueCertificate(userId, courseId, pdfUrl);
                await this.kafka.emit('certificate.issued', userId, {
                    userId, courseId, courseTitle: course?.title, verificationUuid: cert.verificationUuid,
                });
            }
        }
    }
}
