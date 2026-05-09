import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';
import { CreateSectionDto, UpdateSectionDto, ReorderSectionsDto } from './dto/section.dto';

@Injectable()
export class SectionsService {
    constructor(private prisma: PrismaService, private courses: CoursesService) {}

    async create(courseId: string, userId: string, dto: CreateSectionDto) {
        await this.assertCourseOwner(courseId, userId);
        const section = await this.prisma.section.create({ data: { ...dto, courseId } });
        await this.courses.recalculateCounters(courseId);
        return section;
    }

    async update(sectionId: string, userId: string, dto: UpdateSectionDto) {
        const section = await this.getSectionOrThrow(sectionId);
        await this.assertCourseOwner(section.courseId, userId);
        return this.prisma.section.update({ where: { id: sectionId }, data: dto });
    }

    async remove(sectionId: string, userId: string) {
        const section = await this.getSectionOrThrow(sectionId);
        await this.assertCourseOwner(section.courseId, userId);
        await this.prisma.section.delete({ where: { id: sectionId } });
        await this.courses.recalculateCounters(section.courseId);
    }

    async reorder(courseId: string, userId: string, dto: ReorderSectionsDto) {
        await this.assertCourseOwner(courseId, userId);
        await Promise.all(
            dto.items.map(({ id, order }) =>
                this.prisma.section.update({ where: { id }, data: { order } }),
            ),
        );
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
