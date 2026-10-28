package com.lms.notification_service.models.request;

import com.lms.notification_service.models.entity.DeviceToken;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/** The user is taken from the access token, never from the body. */
@Data
public class DeviceRegisterRequest {
    @NotBlank(message = "token is required")
    @Size(max = 4096)
    private String token;
    @NotNull(message = "platform is required")
    private DeviceToken.Platform platform;
}
