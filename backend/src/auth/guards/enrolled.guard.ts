import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EnrolledGuard implements CanActivate {
    constructor(private prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest();
        const userId: string = req.user?.id;
        const courseId: string = req.params.courseId;

        if (!userId || !courseId) throw new ForbiddenException();

        const lesson = req.params.lessonId
            ? await this.prisma.lesson.findUnique({
                where: { id: req.params.lessonId },
                select: { isFree: true },
            })
            : null;

        if (lesson?.isFree) return true;

        const enrollment = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });

        if (!enrollment) throw new ForbiddenException('You are not enrolled in this course');
        return true;
    }
}
