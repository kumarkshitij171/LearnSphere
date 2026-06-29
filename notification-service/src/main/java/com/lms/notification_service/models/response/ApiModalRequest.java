package com.lms.notification_service.models.response;

import lombok.Data;

import java.util.Map;

@Data
public class ApiModalRequest {
    private String name;
    private Map<String,String> templateVariables;
    private String templateMessage;
}
