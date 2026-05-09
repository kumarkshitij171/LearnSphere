import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto, ChangePasswordDto, ApplyInstructorDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('api/v1/users')
export class UsersController {
    constructor(private usersService: UsersService) {}

    @Get('me')
    @UseGuards(JwtAuthGuard)
    getMe(@CurrentUser() user: any) {
        return this.usersService.getProfile(user.id);
    }

    @Patch('me')
    @UseGuards(JwtAuthGuard)
    updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto) {
        return this.usersService.updateProfile(user.id, dto);
    }

    @Post('me/change-password')
    @UseGuards(JwtAuthGuard)
    changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
        return this.usersService.changePassword(user.id, dto);
    }

    @Post('me/apply-instructor')
    @UseGuards(JwtAuthGuard)
    applyInstructor(@CurrentUser() user: any, @Body() dto: ApplyInstructorDto) {
        return this.usersService.applyInstructor(user.id, dto);
    }

    @Get('instructor/:userId')
    getInstructorProfile(@Param('userId') userId: string) {
        return this.usersService.getInstructorProfile(userId);
    }
}
