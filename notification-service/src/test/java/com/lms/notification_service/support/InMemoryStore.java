package com.lms.notification_service.support;

import com.lms.notification_service.models.domain.ChannelType;
import com.lms.notification_service.models.entity.DeadLetter;
import com.lms.notification_service.models.entity.Notification;
import com.lms.notification_service.models.entity.Template;
import com.lms.notification_service.repository.DeadLetterRepository;
import com.lms.notification_service.repository.NotificationRepository;
import com.lms.notification_service.repository.TemplateRepository;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

/** Gives Mockito'd Mongo repositories just enough memory for the delivery pipeline to behave as it would on Mongo. */
public final class InMemoryStore {

    public final List<Notification> notifications = new CopyOnWriteArrayList<>();
    public final List<DeadLetter> deadLetters = new CopyOnWriteArrayList<>();
    public final Map<String, Template> templates = new ConcurrentHashMap<>();

    public void wire(NotificationRepository notificationRepo, DeadLetterRepository deadLetterRepo, TemplateRepository templateRepo) {
        lenient().when(notificationRepo.save(any(Notification.class))).thenAnswer(inv -> {
            Notification n = inv.getArgument(0);
            if (n.getId() == null) {
                n.setId(UUID.randomUUID().toString());
                notifications.add(n);
            }
            return n;
        });
        lenient().when(notificationRepo.findByTenantIdAndNotificationId(anyString(), anyString())).thenAnswer(inv ->
                notifications.stream().filter(n -> n.getTenantId().equals(inv.getArgument(0))
                        && n.getNotificationId().equals(inv.getArgument(1))).toList());

        lenient().when(deadLetterRepo.save(any(DeadLetter.class))).thenAnswer(inv -> {
            DeadLetter d = inv.getArgument(0);
            if (d.getId() == null) {
                d.setId(UUID.randomUUID().toString());
                deadLetters.add(d);
            }
            return d;
        });
        lenient().when(deadLetterRepo.findByIdAndTenantId(anyString(), anyString())).thenAnswer(inv ->
                deadLetters.stream().filter(d -> d.getId().equals(inv.getArgument(0))
                        && d.getTenantId().equals(inv.getArgument(1))).findFirst());
        lenient().when(deadLetterRepo.findByTenantIdAndReplayedAtIsNullOrderByCreatedAtDesc(anyString(), any(Pageable.class)))
                .thenAnswer(inv -> new PageImpl<>(deadLetters.stream().filter(d -> d.getReplayedAt() == null).toList()));
        lenient().when(deadLetterRepo.countByReplayedAtIsNull()).thenAnswer(inv ->
                deadLetters.stream().filter(d -> d.getReplayedAt() == null).count());

        lenient().when(templateRepo.findByTenantIdAndNameAndChannelAndActiveIsTrue(anyString(), anyString(), any(ChannelType.class)))
                .thenAnswer(inv -> Optional.ofNullable(templates.get(inv.getArgument(1) + "/" + inv.getArgument(2))));
    }

    public void template(String name, ChannelType channel, String subject, String body) {
        Template t = new Template();
        t.setTenantId("learnsphere");
        t.setName(name);
        t.setChannel(channel);
        t.setSubject(subject);
        t.setTemplateMessage(body);
        t.setTemplateVariables(Map.of());
        t.setActive(true);
        templates.put(name + "/" + channel, t);
    }

    public Optional<Notification> row(String notificationId, ChannelType channel) {
        return notifications.stream().filter(n -> n.getNotificationId().equals(notificationId) && n.getChannel() == channel).findFirst();
    }

    public void clear() {
        notifications.clear();
        deadLetters.clear();
        templates.clear();
    }
}
