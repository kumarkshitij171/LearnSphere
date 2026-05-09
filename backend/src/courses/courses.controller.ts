import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { CreateCourseDto, UpdateCourseDto, CourseFilterDto } from './dto/course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Courses')
@Controller('api/v1/courses')
export class CoursesController {
    constructor(private coursesService: CoursesService) {}

    // ── Instructor-specific routes (must come before :id wildcard) ───────────

    @Get('instructor/my-courses')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    @ApiBearerAuth()
    myCourses(@CurrentUser() user: any) {
        return this.coursesService.getInstructorCourses(user.id);
    }

    // ── Public ──────────────────────────────────────────────────────────────

    @Get()
    list(@Query() filters: CourseFilterDto) {
        return this.coursesService.listPublished(filters);
    }

    @Get('featured')
    featured() {
        return this.coursesService.getFeatured();
    }

    @Get('slug/:slug')
    getBySlug(@Param('slug') slug: string, @Query('userId') userId?: string) {
        return this.coursesService.getCourseBySlug(slug, userId);
    }

    @Get(':id')
    getById(@Param('id') id: string, @Query('userId') userId?: string) {
        return this.coursesService.getCourseDetail(id, userId);
    }

    // ── Instructor ───────────────────────────────────────────────────────────

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    @ApiBearerAuth()
    create(@CurrentUser() user: any, @Body() dto: CreateCourseDto) {
        return this.coursesService.create(user.id, dto);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    @ApiBearerAuth()
    update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateCourseDto) {
        return this.coursesService.update(id, user.id, dto);
    }

    @Post(':id/submit-review')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    @ApiBearerAuth()
    submitForReview(@Param('id') id: string, @CurrentUser() user: any) {
        return this.coursesService.submitForReview(id, user.id);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('INSTRUCTOR' as any)
    @ApiBearerAuth()
    deleteDraft(@Param('id') id: string, @CurrentUser() user: any) {
        return this.coursesService.deleteDraft(id, user.id);
    }
}
