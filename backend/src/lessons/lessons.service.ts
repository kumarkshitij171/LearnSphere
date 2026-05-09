import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';
import { VideoUploadService } from '../video-upload/video-upload.service';
import { CreateLessonDto, UpdateLessonDto, ReorderLessonsDto } from './dto/lesson.dto';

@Injectable()
export class LessonsService {
    constructor(
        private prisma: PrismaService,
        private courses: CoursesService,
        private videoUpload: VideoUploadService,
    ) {}

    async create(sectionId: string, userId: string, dto: CreateLessonDto) {
        const section = await this.getSectionOrThrow(sectionId);
        await this.assertCourseOwner(section.courseId, userId);

        const lesson = await this.prisma.lesson.create({
            data: { ...dto, sectionId },
        });

        await this.courses.recalculateCounters(section.courseId);
        return lesson;
    }

    async update(lessonId: string, userId: string, dto: UpdateLessonDto) {
        const lesson = await this.getLessonOrThrow(lessonId);
        const section = await this.getSectionOrThrow(lesson.sectionId);
        await this.assertCourseOwner(section.courseId, userId);

        const updated = await this.prisma.lesson.update({ where: { id: lessonId }, data: dto });
        await this.courses.recalculateCounters(section.courseId);
        return updated;
    }

    async remove(lessonId: string, userId: string) {
        const lesson = await this.getLessonOrThrow(lessonId);
        const section = await this.getSectionOrThrow(lesson.sectionId);
        await this.assertCourseOwner(section.courseId, userId);

        await this.prisma.lesson.delete({ where: { id: lessonId } });
        await this.courses.recalculateCounters(section.courseId);
    }

    async reorderLessons(sectionId: string, userId: string, dto: ReorderLessonsDto) {
        const section = await this.getSectionOrThrow(sectionId);
        await this.assertCourseOwner(section.courseId, userId);

        await Promise.all(
            dto.items.map(({ id, order }) =>
                this.prisma.lesson.update({ where: { id }, data: { order } }),
            ),
        );
    }

    async getStreamToken(lessonId: string, courseId: string, userId?: string) {
        const lesson = await this.getLessonOrThrow(lessonId);
        if (!lesson.videoId) throw new NotFoundException('No video attached to this lesson');

        if (!lesson.isFree) {
            if (!userId) throw new ForbiddenException('Authentication required');
            const enrolled = await this.prisma.enrollment.findUnique({
                where: { userId_courseId: { userId, courseId } },
            });
            if (!enrolled) throw new ForbiddenException('Not enrolled in this course');
        }

        return this.videoUpload.getStreamUrl(lesson.videoId);
    }

    private async getLessonOrThrow(lessonId: string) {
        const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
        if (!lesson) throw new NotFoundException('Lesson not found');
        return lesson;
    }

    private async getSectionOrThrow(sectionId: string) {
        const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
        if (!section) throw new NotFoundException('Section not found');
        return section;
    }

    private async assertCourseOwner(courseId: string, userId: string) {
        const course = await this.prisma.course.findUnique({
            where: { id: courseId },
            include: { instructor: true },
        });
        if (!course) throw new NotFoundException('Course not found');
        if (course.instructor.userId !== userId) throw new ForbiddenException('Not authorized');
    }
}
