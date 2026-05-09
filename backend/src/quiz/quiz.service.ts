import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../kafka/kafka.service';
import { CreateQuizDto, SubmitQuizDto } from './dto/quiz.dto';

@Injectable()
export class QuizService {
    constructor(private prisma: PrismaService, private kafka: KafkaService) {}

    async createOrUpdate(lessonId: string, userId: string, dto: CreateQuizDto) {
        const lesson = await this.prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { section: { include: { course: { include: { instructor: true } } } } },
        });
        if (!lesson) throw new NotFoundException('Lesson not found');
        if (lesson.section.course.instructor.userId !== userId) throw new ForbiddenException('Not authorized');

        const existing = await this.prisma.quiz.findUnique({ where: { lessonId } });
        if (existing) {
            await this.prisma.question.deleteMany({ where: { quizId: existing.id } });
            await this.prisma.quiz.update({ where: { id: existing.id }, data: { passMark: dto.passMark } });

            await Promise.all(
                dto.questions.map(q =>
                    this.prisma.question.create({
                        data: { quizId: existing.id, type: q.type, text: q.text, options: q.options as any, explanation: q.explanation, order: q.order },
                    }),
                ),
            );
            return this.prisma.quiz.findUnique({ where: { lessonId }, include: { questions: true } });
        }

        return this.prisma.quiz.create({
            data: {
                lessonId, passMark: dto.passMark,
                questions: { create: dto.questions.map(q => ({ ...q, options: q.options as any })) },
            },
            include: { questions: true },
        });
    }

    async getQuiz(lessonId: string) {
        const quiz = await this.prisma.quiz.findUnique({
            where: { lessonId },
            include: {
                questions: {
                    orderBy: { order: 'asc' },
                    select: { id: true, type: true, text: true, order: true, options: true },
                },
            },
        });
        if (!quiz) throw new NotFoundException('Quiz not found');

        // Strip isCorrect from options — served without answers
        return {
            ...quiz,
            questions: quiz.questions.map(q => ({
                ...q,
                options: (q.options as any[]).map(({ isCorrect: _, ...rest }) => rest),
            })),
        };
    }

    async submitAttempt(quizId: string, userId: string, dto: SubmitQuizDto) {
        const quiz = await this.prisma.quiz.findUnique({
            where: { id: quizId },
            include: {
                questions: true,
                lesson: { include: { section: { select: { courseId: true } } } },
            },
        });
        if (!quiz) throw new NotFoundException('Quiz not found');

        const courseId = quiz.lesson?.section?.courseId;

        const answerMap = Object.fromEntries(dto.answers.map(a => [a.questionId, a.selectedOptionId]));

        let correct = 0;
        const results = quiz.questions.map(q => {
            const options = q.options as any[];
            const selected = answerMap[q.id];
            const correctOption = options.find(o => o.isCorrect);
            const isCorrect = selected === correctOption?.id;
            if (isCorrect) correct++;
            return { questionId: q.id, selected, correct: correctOption?.id, isCorrect, explanation: q.explanation };
        });

        const score = Math.round((correct / quiz.questions.length) * 100);
        const passed = score >= quiz.passMark;

        const attempt = await this.prisma.quizAttempt.create({
            data: { quizId, userId, answers: answerMap, score, passed },
        });

        if (passed) {
            await this.kafka.emit('quiz.passed', userId, { userId, quizId, courseId, score });
        }

        return { attempt, results, score, passed };
    }

    async getAttemptHistory(quizId: string, userId: string) {
        return this.prisma.quizAttempt.findMany({
            where: { quizId, userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async deleteQuiz(lessonId: string, userId: string) {
        const lesson = await this.prisma.lesson.findUnique({
            where: { id: lessonId },
            include: { section: { include: { course: { include: { instructor: true } } } } },
        });
        if (!lesson) throw new NotFoundException('Lesson not found');
        if (lesson.section.course.instructor.userId !== userId) throw new ForbiddenException();

        await this.prisma.quiz.delete({ where: { lessonId } });
    }
}
