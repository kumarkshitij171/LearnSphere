package com.lms.notification_service.models.entity;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/** FCM registration token for one browser/device; the PUSH sender fans out over these. */
@Data
@Document(collection = "device_tokens")
@EqualsAndHashCode(callSuper = true)
public class DeviceToken extends AbstractEntity {
    @Id
    private String id;
    @Indexed
    private String tenantId;
    @Indexed
    private String userId;
    @Indexed(unique = true)
    private String token;
    private Platform platform;
    private boolean active = true;

    public enum Platform {
        WEB,
        ANDROID,
        IOS
    }
}
