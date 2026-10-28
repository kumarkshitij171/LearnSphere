package com.lms.notification_service.channel.email;

import com.lms.notification_service.channel.ChannelSender;
import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailParseException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;

@Component
@RequiredArgsConstructor
public class EmailSender implements ChannelSender {

    private static final String PROVIDER = "smtp";

    private final JavaMailSender mailSender;

    @Value("${lms.notification.mail-from}")
    private String from;

    @Override
    public ChannelType channel() {
        return ChannelType.EMAIL;
    }

    @Override
    public String resolveTarget(NotificationTarget target) {
        return target == null ? null : target.email();
    }

    @Override
    public SendResult send(Notification notification, NotificationTarget target, RenderedContent content) {
        String to = resolveTarget(target);
        if (!StringUtils.hasText(to)) {
            return SendResult.failed(PROVIDER, ErrorType.PERMANENT, "target.email is missing");
        }
        try {
            MimeMessage mime = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mime, false, StandardCharsets.UTF_8.name());
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject(StringUtils.hasText(content.subject()) ? content.subject() : "");
            helper.setText(content.body(), true);
            mailSender.send(mime);
            return SendResult.sent(PROVIDER, mime.getMessageID());
        } catch (MailAuthenticationException | MailParseException e) {
            // bad credentials or a malformed address won't fix themselves on a retry
            return SendResult.failed(PROVIDER, ErrorType.PERMANENT, e.getMessage());
        } catch (Exception e) {
            return SendResult.failed(PROVIDER, ErrorType.TRANSIENT, e.getMessage());
        }
    }
}
