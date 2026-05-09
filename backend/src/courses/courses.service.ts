import {
    BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { CourseLevel, CourseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { CreateCourseDto, UpdateCourseDto, CourseFilterDto } from './dto/course.dto';

@Injectable()
export class CoursesService {
    constructor(private prisma: PrismaService, private kafka: KafkaService) {}

    async create(userId: string, dto: CreateCourseDto) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        if (!profile || !profile.isApproved) throw new ForbiddenException('Instructor profile not approved');

        const slug = await this.uniqueSlug(dto.title);

        return this.prisma.course.create({
            data: {
                ...dto,
                slug,
                instructorId: profile.id,
                requirements: dto.requirements ?? [],
                learnings: dto.learnings ?? [],
                tags: dto.tags ?? [],
            },
        });
    }

    async update(courseId: string, userId: string, dto: UpdateCourseDto) {
        const course = await this.getCourseOrThrow(courseId);
        await this.assertOwner(course, userId);
        if (course.status !== 'DRAFT' && course.status !== 'UNDER_REVIEW') {
            throw new BadRequestException('Published courses cannot be edited directly. Archive first.');
        }

        const slugUpdate = dto.title ? { slug: await this.uniqueSlug(dto.title, courseId) } : {};

        return this.prisma.course.update({
            where: { id: courseId },
            data: { ...dto, ...slugUpdate },
        });
    }

    async submitForReview(courseId: string, userId: string) {
        const course = await this.getCourseOrThrow(courseId);
        await this.assertOwner(course, userId);
        if (course.status !== 'DRAFT') throw new BadRequestException('Only draft courses can be submitted');

        return this.prisma.course.update({
            where: { id: courseId },
            data: { status: 'UNDER_REVIEW' },
        });
    }

    async deleteDraft(courseId: string, userId: string) {
        const course = await this.getCourseOrThrow(courseId);
        await this.assertOwner(course, userId);
        if (course.status !== 'DRAFT') throw new BadRequestException('Only draft courses can be deleted');

        await this.prisma.course.delete({ where: { id: courseId } });
    }

    async getInstructorCourses(userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        if (!profile) return [];

        return this.prisma.course.findMany({
            where: { instructorId: profile.id },
            orderBy: { createdAt: 'desc' },
            include: { category: true },
        });
    }

    async getCourseDetail(courseId: string, userId?: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            include: {
                instructor: { include: { user: { select: { id: true, name: true, avatar: true, bio: true } } } },
                category: true,
                sections: {
                    orderBy: { order: 'asc' },
                    include: {
                        lessons: {
                            orderBy: { order: 'asc' },
                            select: {
                                id: true, title: true, order: true, type: true,
                                isFree: true, duration: true, sectionId: true,
                            },
                        },
                    },
                },
                reviews: {
                    take: 5,
                    orderBy: { createdAt: 'desc' },
                    include: { user: { select: { name: true, avatar: true } } },
                },
                _count: { select: { enrollments: true } },
            },
        });

        if (!course) throw new NotFoundException('Course not found');
        if (course.status !== 'PUBLISHED') {
            const isOwner = userId && await this.isOwner(course, userId);
            const isAdmin = userId && await this.isAdmin(userId);
            if (!isOwner && !isAdmin) throw new NotFoundException('Course not found');
        }

        return course;
    }

    async getCourseBySlug(slug: string, userId?: string) {
        const course = await this.prisma.course.findUnique({ where: { slug } });
        if (!course) throw new NotFoundException('Course not found');
        return this.getCourseDetail(course.id, userId);
    }

    async listPublished(filters: CourseFilterDto) {
        const {
            categoryId, level, minPrice, maxPrice, language,
            minRating, search, sortBy = 'newest', cursor, limit = 20,
        } = filters;

        const where: Prisma.CourseWhereInput = {
            status: CourseStatus.PUBLISHED,
            ...(categoryId && { categoryId }),
            ...(level && { level: level as CourseLevel }),
            ...(language && { language }),
            ...(minPrice !== undefined || maxPrice !== undefined
                ? { price: { gte: minPrice, lte: maxPrice } }
                : {}),
            ...(minRating !== undefined ? { rating: { gte: minRating } } : {}),
            ...(search ? {
                OR: [
                    { title: { contains: search, mode: 'insensitive' as const } },
                    { description: { contains: search, mode: 'insensitive' as const } },
                    { tags: { has: search } },
                ],
            } : {}),
        };

        const orderBy: Prisma.CourseOrderByWithRelationInput =
            sortBy === 'popular' ? { totalStudents: 'desc' }
            : sortBy === 'rating' ? { rating: 'desc' }
            : { createdAt: 'desc' };

        const take = (limit ?? 20) + 1;
        const courses = await this.prisma.course.findMany({
            where,
            orderBy,
            take,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: {
                instructor: { include: { user: { select: { name: true, avatar: true } } } },
                category: { select: { name: true, slug: true } },
            },
        });

        const hasNextPage = courses.length > (limit ?? 20);
        const items = hasNextPage ? courses.slice(0, limit) : courses;
        return { items, nextCursor: hasNextPage ? items[items.length - 1].id : null };
    }

    async getFeatured() {
        return this.prisma.course.findMany({
            where: { status: 'PUBLISHED' },
            orderBy: { totalStudents: 'desc' },
            take: 8,
            include: { instructor: { include: { user: { select: { name: true, avatar: true } } } }, category: true },
        });
    }

    async recalculateCounters(courseId: string) {
        const sections = await this.prisma.section.findMany({
            where: { courseId },
            include: { lessons: { include: { video: true } } },
        });

        let totalDuration = 0;
        let totalLectures = 0;

        for (const section of sections) {
            for (const lesson of section.lessons) {
                totalLectures++;
                totalDuration += lesson.duration ?? lesson.video?.duration ?? 0;
            }
        }

        await this.prisma.course.update({
            where: { id: courseId },
            data: { totalDuration, totalLectures },
        });
    }

    private async getCourseOrThrow(courseId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            include: { instructor: true },
        });
        if (!course) throw new NotFoundException('Course not found');
        return course;
    }

    private async assertOwner(course: any, userId: string) {
        if (course.instructor.userId !== userId) throw new ForbiddenException('Not authorized');
    }

    private async isOwner(course: any, userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        return profile && course.instructorId === profile.id;
    }

    private async isAdmin(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        return user?.role === 'ADMIN';
    }

    private async uniqueSlug(title: string, excludeId?: string): Promise<string> {
        let slug = title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
        let suffix = 0;
        while (true) {
            const candidate = suffix === 0 ? slug : `${slug}-${suffix}`;
            const existing = await this.prisma.course.findUnique({ where: { slug: candidate } });
            if (!existing || existing.id === excludeId) return candidate;
            suffix++;
        }
    }
}
