package com.lms.notification_service.controller;

import com.lms.notification_service.models.context.NotificationContextHolder;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.models.request.TemplateRequest;
import com.lms.notification_service.repository.TemplateRepository;
import com.lms.notification_service.service.TemplateService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/templates")
@RequiredArgsConstructor
public class TemplateController {

    private final TemplateRepository templateRepository;
    private final TemplateService templateService;

    /** Upsert, so re-posting an edited template replaces it instead of tripping the unique index. */
    @PostMapping
    public ResponseEntity<Template> upsert(@Valid @RequestBody TemplateRequest request) {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        Template template = templateRepository
                .findByTenantIdAndNameAndChannel(tenantId, request.getName(), request.getChannel())
                .orElseGet(() -> {
                    Template created = new Template();
                    created.setTenantId(tenantId);
                    created.setName(request.getName());
                    created.setChannel(request.getChannel());
                    created.entityCreate();
                    return created;
                });

        if (template.getId() != null) {
            template.setVersion(template.getVersion() + 1);
            template.entityUpdate();
        }
        template.setSubject(request.getSubject());
        template.setTemplateMessage(request.getTemplateMessage());
        template.setTemplateVariables(request.getTemplateVariables());
        template.setActive(true);

        return ResponseEntity.ok(templateRepository.save(template));
    }

    @GetMapping
    public ResponseEntity<List<Template>> list() {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        return ResponseEntity.ok(templateRepository.findByTenantId(tenantId));
    }

    @GetMapping("/{name}")
    public ResponseEntity<Template> get(@PathVariable String name, @RequestParam ChannelType channel) {
        String tenantId = NotificationContextHolder.getNotificationContext().tenantId();
        return ResponseEntity.ok(templateService.require(tenantId, name, channel));
    }
}
