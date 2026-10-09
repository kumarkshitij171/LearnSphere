package com.lms.notification_service.models.entity;

import com.lms.notification_service.models.domain.ChannelType;
import lombok.Data;
import lombok.EqualsAndHashCode;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.Map;

@Data
@Document(collection = "templates")
@CompoundIndex(name = "tenant_name_channel_idx", def = "{'tenantId': 1, 'name': 1, 'channel': 1}", unique = true)
@EqualsAndHashCode(callSuper = true) // calls super class of the extended class
public class Template extends AbstractEntity {
    @Id
    private String id;
    private String name;
    private ChannelType channel;
    // declared placeholders and their fallback values; a null value means the caller must supply it
    private Map<String, String> templateVariables;
    // rendered for EMAIL subject / PUSH title; unused by SMS
    private String subject;
    private String templateMessage;
    private String tenantId;
    private boolean active = true;
    private int version = 1;
}
