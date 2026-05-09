import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto, CreateAnswerDto } from './dto/qa.dto';

@Injectable()
export class QaService {
    constructor(private prisma: PrismaService) {}

    async createQuestion(userId: string, lessonId: string, dto: CreateQuestionDto) {
        return this.prisma.lessonQuestion.create({
            data: { userId, lessonId, ...dto },
            include: { user: { select: { name: true, avatar: true } } },
        });
    }

    async listQuestions(lessonId: string) {
        return this.prisma.lessonQuestion.findMany({
            where: { lessonId },
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { name: true, avatar: true } },
                answers: {
                    orderBy: { createdAt: 'asc' },
                    include: { user: { select: { name: true, avatar: true } } },
                },
            },
        });
    }

    async createAnswer(userId: string, questionId: string, dto: CreateAnswerDto, userRole: string) {
        const question = await this.prisma.lessonQuestion.findUnique({
            where: { id: questionId },
            include: {
                lesson: {
                    include: {
                        section: { include: { course: { include: { instructor: true } } } },
                    },
                },
            },
        });
        if (!question) throw new NotFoundException('Question not found');

        const isInstructor = question.lesson.section.course.instructor.userId === userId;

        return this.prisma.lessonAnswer.create({
            data: {
                userId,
                questionId,
                body: dto.body,
                isInstructorAnswer: isInstructor,
            },
            include: { user: { select: { name: true, avatar: true } } },
        });
    }

    async getUnansweredForInstructor(userId: string) {
        const profile = await this.prisma.instructorProfile.findUnique({ where: { userId } });
        if (!profile) throw new ForbiddenException();

        const courseIds = await this.prisma.course.findMany({
            where: { instructorId: profile.id },
            select: { id: true },
        });

        return this.prisma.lessonQuestion.findMany({
            where: {
                lesson: { section: { courseId: { in: courseIds.map(c => c.id) } } },
                answers: { none: { isInstructorAnswer: true } },
            },
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { name: true } },
                lesson: { select: { title: true, section: { select: { courseId: true } } } },
            },
        });
    }
}
