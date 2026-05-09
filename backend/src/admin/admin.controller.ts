import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ChangeRoleDto, RejectCourseDto, RejectInstructorDto, CreateCouponDto } from './dto/admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN' as any)
@Controller('api/v1/admin')
export class AdminController {
    constructor(private adminService: AdminService) {}

    // ── Platform Stats ───────────────────────────────────────────────────────

    @Get('stats')
    getStats() {
        return this.adminService.getPlatformStats();
    }

    // ── Users ────────────────────────────────────────────────────────────────

    @Get('users')
    listUsers(
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('role') role?: string,
        @Query('search') search?: string,
    ) {
        return this.adminService.listUsers(page, limit, role, search);
    }

    @Patch('users/:userId/role')
    changeRole(@Param('userId') userId: string, @Body() dto: ChangeRoleDto) {
        return this.adminService.changeRole(userId, dto);
    }

    @Patch('users/:userId/ban')
    banUser(@Param('userId') userId: string) {
        return this.adminService.toggleBan(userId, true);
    }

    @Patch('users/:userId/unban')
    unbanUser(@Param('userId') userId: string) {
        return this.adminService.toggleBan(userId, false);
    }

    @Delete('users/:userId')
    deleteUser(@Param('userId') userId: string) {
        return this.adminService.deleteUser(userId);
    }

    // ── Instructor Approval ──────────────────────────────────────────────────

    @Get('instructor-applications')
    listPendingInstructors() {
        return this.adminService.listPendingInstructors();
    }

    @Post('instructor-applications/:profileId/approve')
    approveInstructor(@Param('profileId') profileId: string) {
        return this.adminService.approveInstructor(profileId);
    }

    @Post('instructor-applications/:profileId/reject')
    rejectInstructor(@Param('profileId') profileId: string, @Body() dto: RejectInstructorDto) {
        return this.adminService.rejectInstructor(profileId, dto);
    }

    // ── Course Moderation ────────────────────────────────────────────────────

    @Get('courses')
    listCourses(@Query('status') status?: string) {
        return this.adminService.listCourses(status);
    }

    @Post('courses/:courseId/publish')
    publishCourse(@Param('courseId') courseId: string) {
        return this.adminService.publishCourse(courseId);
    }

    @Post('courses/:courseId/reject')
    rejectCourse(@Param('courseId') courseId: string, @Body() dto: RejectCourseDto) {
        return this.adminService.rejectCourse(courseId, dto);
    }

    @Post('courses/:courseId/archive')
    archiveCourse(@Param('courseId') courseId: string) {
        return this.adminService.archiveCourse(courseId);
    }

    // ── Coupons ──────────────────────────────────────────────────────────────

    @Post('coupons')
    createCoupon(@Body() dto: CreateCouponDto) {
        return this.adminService.createCoupon(dto);
    }

    // ── Instructor Analytics ─────────────────────────────────────────────────

    @Get('instructor-analytics')
    instructorAnalytics(@CurrentUser() user: any) {
        return this.adminService.getInstructorAnalytics(user.id);
    }
}
