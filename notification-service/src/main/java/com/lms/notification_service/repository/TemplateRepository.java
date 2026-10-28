package com.lms.notification_service.repository;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.entity.Template;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface TemplateRepository extends MongoRepository<Template, String> {

    Optional<Template> findByTenantIdAndNameAndChannelAndActiveIsTrue(String tenantId, String name, ChannelType channel);

    Optional<Template> findByTenantIdAndNameAndChannel(String tenantId, String name, ChannelType channel);

    List<Template> findByTenantId(String tenantId);
}
