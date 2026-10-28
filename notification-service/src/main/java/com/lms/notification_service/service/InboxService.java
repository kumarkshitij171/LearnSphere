package com.lms.notification_service.service;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.response.InboxResponse;
import com.lms.notification_service.repository.NotificationRepository;
import com.lms.notification_service.utils.CommonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

/**
 * A user's IN_APP ledger rows, read as an inbox. Every query is scoped to the caller's tenant and
 * user, and to SENT rows: a row still retrying has nothing to show yet.
 */
@Service
@RequiredArgsConstructor
public class InboxService {

    public static final int DEFAULT_LIMIT = 30;
    public static final int MAX_LIMIT = 100;

    private final NotificationRepository notifications;

    public InboxResponse list(String tenantId, String userId, int limit) {
        int bounded = Math.min(Math.max(limit, 1), MAX_LIMIT);
        List<InboxResponse.Item> items = notifications
                .findByTenantIdAndUserIdAndChannelAndStatusOrderByCreatedAtDesc(tenantId, userId, ChannelType.IN_APP,
                        NotificationStatus.SENT, Limit.of(bounded))
                .stream().map(InboxService::toItem).toList();
        return new InboxResponse(items, unread(tenantId, userId));
    }

    /** @return the unread count left afterwards */
    public long markRead(String tenantId, String userId, Collection<String> ids) {
        long now = CommonUtils.getCurrentTimeStamp();
        List<String> wanted = ids == null ? List.of() : ids.stream().filter(StringUtils::hasText).distinct().toList();
        if (ids == null || ids.isEmpty()) {
            notifications.findAndSetReadAtByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull(
                    tenantId, userId, ChannelType.IN_APP, NotificationStatus.SENT, now);
        } else if (!wanted.isEmpty()) {
            notifications.findAndSetReadAtByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNullAndIdIn(
                    tenantId, userId, ChannelType.IN_APP, NotificationStatus.SENT, wanted, now);
        }
        return unread(tenantId, userId);
    }

    public long unread(String tenantId, String userId) {
        return notifications.countByTenantIdAndUserIdAndChannelAndStatusAndReadAtIsNull(
                tenantId, userId, ChannelType.IN_APP, NotificationStatus.SENT);
    }

    private static InboxResponse.Item toItem(Notification n) {
        return new InboxResponse.Item(n.getId(), n.getNotificationId(), n.getTitle(), n.getBody(), n.getLink(),
                Instant.ofEpochMilli(n.getCreatedAt()).toString(),
                n.getReadAt() == null ? null : Instant.ofEpochMilli(n.getReadAt()).toString());
    }
}
