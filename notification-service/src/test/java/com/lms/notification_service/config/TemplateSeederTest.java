package com.lms.notification_service.config;

import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.repository.TemplateRepository;
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
        assertThat(names).contains("order-receipt/EMAIL", "payment-failed/EMAIL", "refund-processed/EMAIL");
        assertThat(saved.getAllValues()).allSatisfy(t -> {
            assertThat(t.getTenantId()).isEqualTo("learnsphere");
            assertThat(t.isActive()).isTrue();
            assertThat(t.getCreatedAt()).isPositive();
        });
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
