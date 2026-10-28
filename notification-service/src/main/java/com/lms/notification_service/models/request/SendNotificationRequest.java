package com.lms.notification_service.models.request;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.event.NotificationTarget;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class SendNotificationRequest {
    // optional: supply your own to make a retry from the caller idempotent
    private String notificationId;
    private String userId;
    @NotEmpty(message = "at least one channel is required")
    private List<ChannelType> channels;
    @NotBlank(message = "templateName is required")
    private String templateName;
    @NotNull(message = "target is required")
    private NotificationTarget target;
    private Map<String, String> variables;
}
