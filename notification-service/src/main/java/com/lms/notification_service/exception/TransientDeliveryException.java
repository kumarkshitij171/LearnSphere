package com.lms.notification_service.exception;

import com.lms.notification_service.models.domain.ChannelType;

import java.util.List;

/** Thrown by the listener so Spring Kafka routes the record to the next retry topic. */
public class TransientDeliveryException extends RuntimeException {

    private final List<ChannelType> channels;

    public TransientDeliveryException(String notificationId, List<ChannelType> channels) {
        super("Transient delivery failure for " + notificationId + " on " + channels);
        this.channels = List.copyOf(channels);
    }

    public List<ChannelType> getChannels() {
        return channels;
    }
}
