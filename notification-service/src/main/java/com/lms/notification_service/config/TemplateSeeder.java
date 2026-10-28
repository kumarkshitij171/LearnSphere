package com.lms.notification_service.config;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.repository.TemplateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

/**
 * Makes a fresh stack able to send: inserts each bundled template that is missing. Never overwrites
 * an existing row, so edits made through POST /api/v1/templates survive a restart.
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "lms.notification.seed-templates", havingValue = "true", matchIfMissing = true)
public class TemplateSeeder implements ApplicationRunner {

    record SeedTemplate(String name, ChannelType channel, String subject, String templateMessage,
                        Map<String, String> templateVariables) {
    }

    private final TemplateRepository templateRepository;
    private final ObjectMapper objectMapper;

    @Value("${lms.notification.seed-tenant:learnsphere}")
    private String tenantId;

    @Override
    public void run(ApplicationArguments args) throws IOException {
        Resource[] resources = new PathMatchingResourcePatternResolver().getResources("classpath:seed-templates/*.json");
        int inserted = 0;
        for (Resource resource : resources) {
            SeedTemplate seed;
            try (InputStream in = resource.getInputStream()) {
                seed = objectMapper.readValue(in, SeedTemplate.class);
            }
            if (templateRepository.findByTenantIdAndNameAndChannel(tenantId, seed.name(), seed.channel()).isPresent()) {
                continue;
            }
            Template template = new Template();
            template.setTenantId(tenantId);
            template.setName(seed.name());
            template.setChannel(seed.channel());
            template.setSubject(seed.subject());
            template.setTemplateMessage(seed.templateMessage());
            template.setTemplateVariables(seed.templateVariables());
            template.setActive(true);
            template.entityCreate();
            templateRepository.save(template);
            inserted++;
        }
        log.info("Template seeding for tenant '{}': {} bundled, {} inserted", tenantId, resources.length, inserted);
    }
}
