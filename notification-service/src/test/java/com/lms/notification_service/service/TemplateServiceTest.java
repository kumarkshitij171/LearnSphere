package com.lms.notification_service.service;

import com.lms.notification_service.exception.ResourceNotFoundException;
import com.lms.notification_service.exception.ValidationException;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.repository.TemplateRepository;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TemplateServiceTest {

    private final TemplateRepository repository = mock(TemplateRepository.class);
    private final TemplateService service = new TemplateService(repository);

    private static Template template(String subject, String body, Map<String, String> defaults) {
        Template t = new Template();
        t.setName("order-receipt");
        t.setSubject(subject);
        t.setTemplateMessage(body);
        t.setTemplateVariables(defaults);
        return t;
    }

    @Test
    void rendersVariablesIntoSubjectAndBody() {
        RenderedContent out = service.render(template("Receipt for {{courseTitle}}", "<p>Hi {{ name }}, {{amount}}</p>", Map.of()),
                Map.of("courseTitle", "Kafka", "name", "Asha", "amount", "₹499.00"));
        assertThat(out.subject()).isEqualTo("Receipt for Kafka");
        assertThat(out.body()).isEqualTo("<p>Hi Asha, ₹499.00</p>");
    }

    @Test
    void callerValuesOverrideDefaultsAndNullDefaultsMustBeSupplied() {
        Map<String, String> defaults = new HashMap<>();
        defaults.put("name", "there");
        defaults.put("courseTitle", null);
        Template t = template("{{courseTitle}}", "Hi {{name}}", defaults);
        assertThat(service.render(t, Map.of("courseTitle", "X")).body()).isEqualTo("Hi there");
        assertThat(service.render(t, Map.of("courseTitle", "X", "name", "Ravi")).body()).isEqualTo("Hi Ravi");
        assertThatThrownBy(() -> service.render(t, Map.of()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("courseTitle");
    }

    @Test
    void neverMailsALiteralPlaceholder() {
        assertThatThrownBy(() -> service.render(template("s", "Hi {{name}}", Map.of()), null))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void valuesAreInsertedLiterallyEvenWithRegexCharacters() {
        assertThat(service.render(template(null, "{{v}}", Map.of()), Map.of("v", "$1 \\ back")).body()).isEqualTo("$1 \\ back");
    }

    @Test
    void aMissingOrInactiveTemplateIsNotFound() {
        when(repository.findByTenantIdAndNameAndChannelAndActiveIsTrue("t", "nope", ChannelType.EMAIL)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.require("t", "nope", ChannelType.EMAIL)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void escapesValuesInEmailBodiesSoTheyCannotInjectMarkup() {
        Template t = template("Receipt", "<p>You bought {{courseTitle}}</p><a href=\"{{url}}\">Open</a>", Map.of());
        t.setChannel(ChannelType.EMAIL);
        RenderedContent out = service.render(t, Map.of(
                "courseTitle", "Kafka <a href=\"https://evil.example\">claim your refund</a>",
                "url", "https://app.example/verify?otp=123456&token=abc"));
        assertThat(out.body()).doesNotContain("<a href=\"https://evil.example\">");
        assertThat(out.body()).contains("Kafka &lt;a href=&quot;https://evil.example&quot;&gt;claim your refund&lt;/a&gt;");
        assertThat(out.body()).contains("href=\"https://app.example/verify?otp=123456&amp;token=abc\"");
    }

    @Test
    void leavesNonAsciiTextReadable() {
        Template t = template("s", "<p>{{amount}} for {{name}}</p>", Map.of());
        t.setChannel(ChannelType.EMAIL);
        assertThat(service.render(t, Map.of("amount", "₹499.00", "name", "Ãsha")).body()).isEqualTo("<p>₹499.00 for Ãsha</p>");
    }

    @Test
    void pushAndSmsBodiesArePlainTextAndNotEscaped() {
        Template t = template("s", "{{courseTitle}} is ready", Map.of());
        t.setChannel(ChannelType.PUSH);
        assertThat(service.render(t, Map.of("courseTitle", "Rock & Roll <101>")).body()).isEqualTo("Rock & Roll <101> is ready");
    }

    @Test
    void aSubjectStaysOnOneLine() {
        Template t = template("Receipt for {{courseTitle}}", "b", Map.of());
        t.setChannel(ChannelType.EMAIL);
        assertThat(service.render(t, Map.of("courseTitle", "Kafka\r\nBcc: victim@example.com")).subject())
                .isEqualTo("Receipt for Kafka Bcc: victim@example.com");
    }
}
