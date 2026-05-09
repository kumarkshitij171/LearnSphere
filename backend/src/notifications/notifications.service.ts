import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService {
    private readonly baseUrl: string;

    constructor(private config: ConfigService) {
        this.baseUrl = config.get('NOTIFICATION_SERVICE_URL', 'http://localhost:8085');
    }

    async getForUser(userId: string, page = 0, size = 20) {
        return this.forward(`/api/v1/notifications/user/${userId}?page=${page}&size=${size}`);
    }

    async getUnreadCount(userId: string) {
        try {
            return await this.forward(`/api/v1/notifications/user/${userId}/unread-count`);
        } catch {
            return { count: 0 };
        }
    }

    async markAllRead(userId: string) {
        return this.forward(`/api/v1/notifications/user/${userId}/mark-all-read`, 'POST');
    }

    async markOneRead(notificationId: string) {
        return this.forward(`/api/v1/notifications/${notificationId}/read`, 'POST');
    }

    private async forward(path: string, method: 'GET' | 'POST' = 'GET') {
        let res: Response;
        try {
            res = await fetch(`${this.baseUrl}${path}`, { method });
        } catch {
            throw new HttpException('Notification service unavailable', 503);
        }

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new HttpException(body || 'Notification service error', res.status);
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
            return res.json();
        }
        return null;
    }
}
