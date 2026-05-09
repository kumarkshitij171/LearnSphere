import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Reviews')
@Controller('api/v1/courses/:courseId/reviews')
export class ReviewsController {
    constructor(private reviewsService: ReviewsService) {}

    @Get()
    list(
        @Param('courseId') courseId: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('sort') sort?: 'date' | 'rating',
    ) {
        return this.reviewsService.listByCourse(courseId, page, limit, sort);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    create(@Param('courseId') courseId: string, @CurrentUser() user: any, @Body() dto: CreateReviewDto) {
        return this.reviewsService.create(user.id, courseId, dto);
    }

    @Patch()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    update(@Param('courseId') courseId: string, @CurrentUser() user: any, @Body() dto: CreateReviewDto) {
        return this.reviewsService.update(user.id, courseId, dto);
    }

    @Delete()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    remove(@Param('courseId') courseId: string, @CurrentUser() user: any) {
        return this.reviewsService.remove(user.id, courseId);
    }
}
