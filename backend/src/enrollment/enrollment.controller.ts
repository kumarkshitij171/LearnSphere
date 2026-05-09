import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EnrollmentService } from './enrollment.service';
import { MarkLessonCompleteDto, SaveWatchPositionDto } from './dto/enrollment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Enrollment')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/enrollments')
export class EnrollmentController {
    constructor(private enrollmentService: EnrollmentService) {}

    @Post('free/:courseId')
    enrollFree(@Param('courseId') courseId: string, @CurrentUser() user: any) {
        return this.enrollmentService.enrollFree(user.id, courseId);
    }

    @Get('my')
    getMyEnrollments(@CurrentUser() user: any) {
        return this.enrollmentService.getMyEnrollments(user.id);
    }

    @Get(':courseId')
    getDetail(@Param('courseId') courseId: string, @CurrentUser() user: any) {
        return this.enrollmentService.getEnrollmentDetail(user.id, courseId);
    }

    @Get(':courseId/progress')
    getProgress(@Param('courseId') courseId: string, @CurrentUser() user: any) {
        return this.enrollmentService.getCourseProgress(user.id, courseId);
    }

    @Post(':courseId/complete-lesson')
    markComplete(@Param('courseId') courseId: string, @CurrentUser() user: any, @Body() dto: MarkLessonCompleteDto) {
        return this.enrollmentService.markLessonComplete(user.id, courseId, dto.lessonId);
    }

    @Post(':courseId/watch-position')
    savePosition(@Param('courseId') courseId: string, @CurrentUser() user: any, @Body() dto: SaveWatchPositionDto) {
        return this.enrollmentService.saveWatchPosition(user.id, courseId, dto.lessonId, dto.watchedSeconds);
    }
}
