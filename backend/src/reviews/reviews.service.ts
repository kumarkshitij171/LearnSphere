import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
    constructor(private prisma: PrismaService) {}

    async create(userId: string, courseId: string, dto: CreateReviewDto) {
        const enrollment = await this.prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });
        if (!enrollment) throw new ForbiddenException('Must be enrolled to review');

        const existing = await this.prisma.review.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });
        if (existing) throw new BadRequestException('Review already submitted');

        const review = await this.prisma.review.create({ data: { userId, courseId, ...dto } });
        await this.recalculateRating(courseId);
        return review;
    }

    async update(userId: string, courseId: string, dto: CreateReviewDto) {
        const review = await this.prisma.review.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });
        if (!review) throw new NotFoundException('Review not found');

        const updated = await this.prisma.review.update({
            where: { id: review.id },
            data: dto,
        });
        await this.recalculateRating(courseId);
        return updated;
    }

    async remove(userId: string, courseId: string) {
        const review = await this.prisma.review.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });
        if (!review) throw new NotFoundException('Review not found');

        await this.prisma.review.delete({ where: { id: review.id } });
        await this.recalculateRating(courseId);
    }

    async listByCourse(courseId: string, page = 1, limit = 20, sort: 'date' | 'rating' = 'date') {
        const orderBy = sort === 'rating' ? { rating: 'desc' as const } : { createdAt: 'desc' as const };

        return this.prisma.review.findMany({
            where: { courseId },
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: { user: { select: { name: true, avatar: true } } },
        });
    }

    private async recalculateRating(courseId: string) {
        const agg = await this.prisma.review.aggregate({
            where: { courseId },
            _avg: { rating: true },
            _count: { id: true },
        });

        await this.prisma.course.update({
            where: { id: courseId },
            data: { rating: agg._avg.rating ?? 0, reviewCount: agg._count.id },
        });
    }
}
