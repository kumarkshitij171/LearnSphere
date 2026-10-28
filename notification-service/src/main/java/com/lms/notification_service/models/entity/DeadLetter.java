package com.lms.notification_service.models.entity;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * One channel of one notification that will not be delivered without a human: a permanent failure
 * or exhausted retries. Holds the original message so it can be replayed once the cause is fixed.
 */
@Data
@Document(collection = "dead_letters")
@CompoundIndex(name = "tenant_open_idx", def = "{'tenantId': 1, 'replayedAt': 1, 'createdAt': -1}")
@EqualsAndHashCode(callSuper = true)
public class DeadLetter extends AbstractEntity {
    @Id
    private String id;
    private String tenantId;
    private String notificationId;
    private String userId;
    private ChannelType channel;
    private String templateName;
    private ErrorType errorType;
    private String errorMessage;
    private int attempts;
    // the NotificationMessage as received, JSON
    private String payload;
    private Long replayedAt;
    private String replayedBy;
}
