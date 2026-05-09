import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/notifications')
export class NotificationsController {
    constructor(private notificationsService: NotificationsService) {}

    @Get()
    getMyNotifications(
        @CurrentUser() user: any,
        @Query('page') page?: number,
        @Query('size') size?: number,
    ) {
        return this.notificationsService.getForUser(user.id, page ?? 0, size ?? 20);
    }

    @Get('unread-count')
    getUnreadCount(@CurrentUser() user: any) {
        return this.notificationsService.getUnreadCount(user.id);
    }

    @Patch('read-all')
    markAllRead(@CurrentUser() user: any) {
        return this.notificationsService.markAllRead(user.id);
    }

    @Patch(':id/read')
    markOneRead(@Param('id') id: string) {
        return this.notificationsService.markOneRead(id);
    }
}
