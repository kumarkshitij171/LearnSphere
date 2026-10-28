package com.lms.notification_service.models.entity;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.NotificationStatus;
import com.lms.notification_service.models.domain.SendResult;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Map;

@Data
@Document(collection = "notifications")
@CompoundIndex(name = "notification_channel_idx", def = "{'notificationId': 1, 'channel': 1}", unique = true)
@CompoundIndex(name = "inbox_idx", def = "{'tenantId': 1, 'userId': 1, 'channel': 1, 'createdAt': -1}")
@EqualsAndHashCode(callSuper = true)
public class Notification extends AbstractEntity {
    @Id
    private String id;
    // shared across every channel row produced by one inbound message
    private String notificationId;
    @Indexed
    private String tenantId;
    @Indexed
    private String userId;
    private ChannelType channel;
    private String target;
    private String templateName;
    private Map<String, String> variables;
    private NotificationStatus status = NotificationStatus.PENDING;
    private int attempts;
    private String provider;
    private String providerMessageId;
    private ErrorType errorType;
    private String errorMessage;
    // IN_APP only: the row is the inbox entry, so it keeps what the user reads
    private String title;
    private String body;
    private String link;
    private Long readAt;

    public void markSent(SendResult result) {
        setStatus(NotificationStatus.SENT);
        setProvider(result.provider());
        setProviderMessageId(result.providerMessageId());
        setErrorType(null);
        setErrorMessage(null);
        entityUpdate();
    }

    public void markSkipped(String provider, String reason) {
        setStatus(NotificationStatus.SKIPPED);
        setProvider(provider);
        setErrorType(null);
        setErrorMessage(reason);
        entityUpdate();
    }

    public void markRetrying(String provider, String errorMessage) {
        setStatus(NotificationStatus.RETRYING);
        setProvider(provider);
        setErrorType(ErrorType.TRANSIENT);
        setErrorMessage(errorMessage);
        entityUpdate();
    }

    /** Settled rows are never sent again on a retry; only a replay re-arms them. */
    public boolean isSettled() {
        return getStatus() == NotificationStatus.SENT || getStatus() == NotificationStatus.SKIPPED
                || getStatus() == NotificationStatus.FAILED;
    }

    public void markFailed(String provider, ErrorType errorType, String errorMessage) {
        setStatus(NotificationStatus.FAILED);
        setProvider(provider);
        setErrorType(errorType);
        setErrorMessage(errorMessage);
        entityUpdate();
    }
}
