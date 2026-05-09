import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { CreateLessonDto, UpdateLessonDto, ReorderLessonsDto } from './dto/lesson.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Lessons')
@Controller('api/v1')
export class LessonsController {
    constructor(private lessonsService: LessonsService) {}

    // Instructor: add lesson to a section
    @Post('sections/:sectionId/lessons')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    create(
        @Param('sectionId') sectionId: string,
        @CurrentUser() user: any,
        @Body() dto: CreateLessonDto,
    ) {
        return this.lessonsService.create(sectionId, user.id, dto);
    }

    @Patch('lessons/:lessonId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    update(@Param('lessonId') lessonId: string, @CurrentUser() user: any, @Body() dto: UpdateLessonDto) {
        return this.lessonsService.update(lessonId, user.id, dto);
    }

    @Delete('lessons/:lessonId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    remove(@Param('lessonId') lessonId: string, @CurrentUser() user: any) {
        return this.lessonsService.remove(lessonId, user.id);
    }

    @Put('sections/:sectionId/lessons/reorder')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    reorder(
        @Param('sectionId') sectionId: string,
        @CurrentUser() user: any,
        @Body() dto: ReorderLessonsDto,
    ) {
        return this.lessonsService.reorderLessons(sectionId, user.id, dto);
    }

    // Student: get stream token for a lesson
    @Get('courses/:courseId/lessons/:lessonId/stream-token')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    getStreamToken(
        @Param('lessonId') lessonId: string,
        @Param('courseId') courseId: string,
        @CurrentUser() user: any,
    ) {
        return this.lessonsService.getStreamToken(lessonId, courseId, user?.id);
    }
}
