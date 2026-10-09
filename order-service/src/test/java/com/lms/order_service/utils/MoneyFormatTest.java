package com.lms.order_service.utils;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MoneyFormatTest {

    @Test
    void formatsMinorUnitsWithTheCurrencyExponent() {
        assertThat(MoneyFormat.display(49900, "INR")).isEqualTo("₹499.00");
        assertThat(MoneyFormat.display(1, "INR")).isEqualTo("₹0.01");
        // digit grouping differs between JDK locale data versions, so only the exponent is pinned
        assertThat(MoneyFormat.display(12345678, "INR")).startsWith("₹").endsWith("456.78");
        assertThat(MoneyFormat.display(499, "USD")).isEqualTo("$4.99");
        assertThat(MoneyFormat.display(500, "JPY")).isEqualTo("¥500");
    }
}
