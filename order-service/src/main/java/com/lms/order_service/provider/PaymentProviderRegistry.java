package com.lms.order_service.provider;

import com.lms.order_service.models.domain.PaymentProviderType;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Same shape as notification-service's ChannelSenderRegistry: Spring injects every provider bean. */
@Component
public class PaymentProviderRegistry {

    private final Map<PaymentProviderType, PaymentProvider> byType = new EnumMap<>(PaymentProviderType.class);

    public PaymentProviderRegistry(List<PaymentProvider> providers) {
        for (PaymentProvider provider : providers) {
            if (byType.putIfAbsent(provider.type(), provider) != null) {
                throw new IllegalStateException("Two payment providers registered for " + provider.type());
            }
        }
    }

    public Optional<PaymentProvider> get(PaymentProviderType type) {
        return Optional.ofNullable(byType.get(type));
    }

    public Set<PaymentProviderType> enabled() {
        return Collections.unmodifiableSet(byType.keySet());
    }
}
