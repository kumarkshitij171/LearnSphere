package com.lms.notification_service.config;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.repository.TemplateRepository;
import com.lms.notification_service.service.TemplateService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TemplateSeederTest {

    private final TemplateRepository repository = mock(TemplateRepository.class);
    private final TemplateSeeder seeder = new TemplateSeeder(repository, JsonMapper.builder().build());

    TemplateSeederTest() {
        ReflectionTestUtils.setField(seeder, "tenantId", "learnsphere");
    }

    @Test
    void insertsEveryBundledTemplateOnAnEmptyDatabase() throws Exception {
        when(repository.findByTenantIdAndNameAndChannel(anyString(), anyString(), any())).thenReturn(Optional.empty());
        seeder.run(null);
        ArgumentCaptor<Template> saved = ArgumentCaptor.forClass(Template.class);
        verify(repository, atLeastOnce()).save(saved.capture());
        List<String> names = saved.getAllValues().stream().map(t -> t.getName() + "/" + t.getChannel()).toList();
        assertThat(names).contains("order-receipt/EMAIL", "payment-failed/EMAIL", "refund-processed/EMAIL",
                "order-receipt/IN_APP", "payment-failed/IN_APP", "refund-processed/IN_APP",
                "announcement/IN_APP", "announcement/PUSH");
        assertThat(saved.getAllValues()).allSatisfy(t -> {
            assertThat(t.getTenantId()).isEqualTo("learnsphere");
            assertThat(t.isActive()).isTrue();
            assertThat(t.getCreatedAt()).isPositive();
        });
    }

    @Test
    void theInboxCopyOfEachPushTemplateSaysTheSameThing() throws Exception {
        when(repository.findByTenantIdAndNameAndChannel(anyString(), anyString(), any())).thenReturn(Optional.empty());
        seeder.run(null);
        ArgumentCaptor<Template> saved = ArgumentCaptor.forClass(Template.class);
        verify(repository, atLeastOnce()).save(saved.capture());
        java.util.Map<String, Template> byKey = new java.util.HashMap<>();
        saved.getAllValues().forEach(t -> byKey.put(t.getName() + "/" + t.getChannel(), t));
        for (String name : List.of("order-receipt", "payment-failed", "refund-processed", "announcement")) {
            Template push = byKey.get(name + "/PUSH");
            Template inbox = byKey.get(name + "/IN_APP");
            assertThat(inbox).as(name + "/IN_APP").isNotNull();
            assertThat(inbox.getSubject()).isEqualTo(push.getSubject());
            assertThat(inbox.getTemplateMessage()).isEqualTo(push.getTemplateMessage());
            assertThat(inbox.getTemplateVariables()).isEqualTo(push.getTemplateVariables());
        }
    }

    @Test
    void anAnnouncementRendersWithOrWithoutItsVariables() throws Exception {
        when(repository.findByTenantIdAndNameAndChannel(anyString(), anyString(), any())).thenReturn(Optional.empty());
        seeder.run(null);
        ArgumentCaptor<Template> saved = ArgumentCaptor.forClass(Template.class);
        verify(repository, atLeastOnce()).save(saved.capture());
        Template announcement = saved.getAllValues().stream()
                .filter(t -> t.getName().equals("announcement") && t.getChannel() == ChannelType.IN_APP).findFirst().orElseThrow();
        TemplateService renderer = new TemplateService(repository);

        RenderedContent full = renderer.render(announcement, java.util.Map.of("title", "Maintenance tonight",
                "message", "Playback is down 02:00–02:30 IST.", "link", "/explore"));
        assertThat(full.subject()).isEqualTo("Maintenance tonight");
        assertThat(full.body()).isEqualTo("Playback is down 02:00–02:30 IST.");

        RenderedContent bare = renderer.render(announcement, null);
        assertThat(bare.subject()).isEqualTo("LearnSphere");
        assertThat(bare.body()).isEmpty();
        assertThat(announcement.getTemplateVariables()).containsKey("link").containsEntry("link", null);
    }

    @Test
    void neverOverwritesATemplateEditedThroughTheApi() throws Exception {
        when(repository.findByTenantIdAndNameAndChannel(anyString(), anyString(), any())).thenReturn(Optional.of(new Template()));
        seeder.run(null);
        verify(repository, org.mockito.Mockito.never()).save(any());
    }

    @Test
    void everyPlaceholderInEveryBundledTemplateIsDeclared() throws Exception {
        when(repository.findByTenantIdAndNameAndChannel(anyString(), anyString(), any())).thenReturn(Optional.empty());
        seeder.run(null);
        ArgumentCaptor<Template> saved = ArgumentCaptor.forClass(Template.class);
        verify(repository, atLeastOnce()).save(saved.capture());
        java.util.regex.Pattern placeholder = java.util.regex.Pattern.compile("\\{\\{\\s*([\\w.]+)\\s*}}");
        for (Template t : saved.getAllValues()) {
            var m = placeholder.matcher((t.getSubject() == null ? "" : t.getSubject()) + t.getTemplateMessage());
            while (m.find()) assertThat(t.getTemplateVariables()).as(t.getName() + " declares " + m.group(1)).containsKey(m.group(1));
        }
        assertThat(saved.getAllValues()).extracting(Template::getChannel).doesNotContainNull();
    }
}
