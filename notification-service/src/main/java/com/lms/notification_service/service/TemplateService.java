package com.lms.notification_service.service;

import com.lms.notification_service.exception.ResourceNotFoundException;
import com.lms.notification_service.exception.ValidationException;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.repository.TemplateRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.HtmlUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class TemplateService {

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([\\w.]+)\\s*}}");

    private final TemplateRepository templateRepository;

    public Template require(String tenantId, String name, ChannelType channel) {
        return templateRepository.findByTenantIdAndNameAndChannelAndActiveIsTrue(tenantId, name, channel)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No active '%s' template named '%s' for tenant '%s'".formatted(channel, name, tenantId)));
    }

    public RenderedContent render(Template template, Map<String, String> variables) {
        Map<String, String> merged = new HashMap<>();
        if (template.getTemplateVariables() != null) {
            template.getTemplateVariables().forEach((key, value) -> {
                if (value != null) merged.put(key, value);
            });
        }
        if (variables != null) {
            variables.forEach((key, value) -> {
                if (value != null) merged.put(key, value);
            });
        }
        // an email body is HTML: a course title like <a href=…> must arrive as text, not as a link
        // an instructor planted in every buyer's receipt. Push and SMS are plain text and stay as is.
        boolean html = template.getChannel() == ChannelType.EMAIL;
        return new RenderedContent(
                singleLine(substitute(template.getSubject(), merged, template.getName(), false)),
                substitute(template.getTemplateMessage(), merged, template.getName(), html));
    }

    // a subject is one header line; a newline inside a value must not be able to start another
    private static String singleLine(String value) {
        return value == null ? null : value.replaceAll("[\\r\\n]+", " ");
    }

    // unresolved placeholders are a template/producer bug, so fail permanently rather than mail "{{name}}"
    private String substitute(String raw, Map<String, String> variables, String templateName, boolean escapeHtml) {
        if (!StringUtils.hasText(raw)) return raw;
        Matcher matcher = PLACEHOLDER.matcher(raw);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String key = matcher.group(1);
            String value = variables.get(key);
            if (value == null) {
                throw new ValidationException(
                        "Template '%s' is missing a value for '%s'".formatted(templateName, key));
            }
            String safe = escapeHtml ? HtmlUtils.htmlEscape(value, "UTF-8") : value;
            matcher.appendReplacement(out, Matcher.quoteReplacement(safe));
        }
        matcher.appendTail(out);
        return out.toString();
    }
}
