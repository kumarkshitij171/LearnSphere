package com.lms.notification_service.channel;

import com.lms.notification_service.models.domain.ChannelType;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class ChannelSenderRegistry {

    private final Map<ChannelType, ChannelSender> senders = new EnumMap<>(ChannelType.class);

    public ChannelSenderRegistry(List<ChannelSender> discovered) {
        discovered.forEach(sender -> senders.put(sender.channel(), sender));
    }

    public Optional<ChannelSender> get(ChannelType channel) {
        return Optional.ofNullable(senders.get(channel));
    }
}
