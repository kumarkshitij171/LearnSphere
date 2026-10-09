package com.lms.notification_service.channel;

import com.lms.notification_service.channel.email.EmailSender;
import com.lms.notification_service.models.domain.ErrorType;
import com.lms.notification_service.models.domain.RenderedContent;
import com.lms.notification_service.models.domain.SendResult;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.event.NotificationTarget;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailAuthenticationException;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class EmailSenderTest {

    private final JavaMailSender mail = mock(JavaMailSender.class);
    private final EmailSender sender = new EmailSender(mail);
    private final RenderedContent content = new RenderedContent("Subject", "<p>Body</p>");

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(sender, "from", "no-reply@learnsphere.dev");
        when(mail.createMimeMessage()).thenAnswer(inv -> new MimeMessage(Session.getInstance(new Properties())));
    }

    private static NotificationTarget to(String email) {
        return new NotificationTarget(email, null, null);
    }

    @Test
    void sendsHtmlMail() throws Exception {
        SendResult result = sender.send(new Notification(), to("student@example.com"), content);
        assertThat(result.success()).isTrue();
        assertThat(result.provider()).isEqualTo("smtp");
        verify(mail).send(any(MimeMessage.class));
    }

    @Test
    void aMissingAddressIsPermanentAndNothingIsSent() {
        SendResult result = sender.send(new Notification(), to(" "), content);
        assertThat(result.errorType()).isEqualTo(ErrorType.PERMANENT);
        verify(mail, never()).send(any(MimeMessage.class));
    }

    @Test
    void badCredentialsArePermanent() {
        doThrow(new MailAuthenticationException("535 auth failed")).when(mail).send(any(MimeMessage.class));
        assertThat(sender.send(new Notification(), to("a@b.c"), content).errorType()).isEqualTo(ErrorType.PERMANENT);
    }

    @Test
    void aConnectionProblemIsTransient() {
        doThrow(new MailSendException("timeout")).when(mail).send(any(MimeMessage.class));
        assertThat(sender.send(new Notification(), to("a@b.c"), content).errorType()).isEqualTo(ErrorType.TRANSIENT);
    }
}
