package com.lms.notification_service.models.response;

import java.util.List;

/** Times are ISO-8601 strings; readAt is null while unread. */
public record InboxResponse(List<Item> items, long unread) {

    public record Item(String id, String notificationId, String title, String body, String link, String createdAt,
                       String readAt) {
    }
}
