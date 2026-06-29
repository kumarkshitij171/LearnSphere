package com.lms.notification_service.models.entity;

import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;


import java.util.Map;
import java.util.UUID;

@Data
@Document(collection="templates")
@EqualsAndHashCode(callSuper = true) // calls super class of the extended class
public class Template extends AbstractEntity {
    @Id
    private UUID id;
    private String name;
    private Map<String,String> templateVariables;
    private String templateMessage;
    private UUID tenantId;
}
