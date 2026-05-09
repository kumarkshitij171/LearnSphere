import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InstructorService } from './instructor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Instructor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('INSTRUCTOR' as any)
@Controller('api/v1/instructor')
export class InstructorController {
    constructor(private instructorService: InstructorService) {}

    @Get('dashboard')
    getDashboard(@CurrentUser() user: any) {
        return this.instructorService.getDashboard(user.id);
    }

    @Get('courses/:courseId/analytics')
    getCourseAnalytics(@Param('courseId') courseId: string, @CurrentUser() user: any) {
        return this.instructorService.getCourseAnalytics(courseId, user.id);
    }

    @Get('courses/:courseId/students')
    getCourseStudents(
        @Param('courseId') courseId: string,
        @CurrentUser() user: any,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
    ) {
        return this.instructorService.getCourseStudents(courseId, user.id, page, limit);
    }

    @Get('qa/unanswered')
    getUnansweredQuestions(@CurrentUser() user: any) {
        return this.instructorService.getUnansweredQuestions(user.id);
    }
}
