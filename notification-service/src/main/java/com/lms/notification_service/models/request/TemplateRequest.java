package com.lms.notification_service.models.request;

import com.lms.notification_service.models.domain.ChannelType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.Map;

@Data
public class TemplateRequest {
    @NotBlank(message = "name is required")
    private String name;
    @NotNull(message = "channel is required")
    private ChannelType channel;
    private String subject;
    @NotBlank(message = "templateMessage is required")
    private String templateMessage;
    private Map<String, String> templateVariables;
}
