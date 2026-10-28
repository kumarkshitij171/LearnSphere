package com.lms.order_service.utils;

import java.math.BigDecimal;
import java.text.NumberFormat;
import java.util.Currency;
import java.util.Locale;

/** Display only: minor units in, a human string out. Money is never computed from the result. */
public final class MoneyFormat {

    private static final Locale INDIA = Locale.forLanguageTag("en-IN");

    private MoneyFormat() {
    }

    public static String display(long amountMinor, String currencyCode) {
        Currency currency = Currency.getInstance(currencyCode);
        int exponent = Math.max(currency.getDefaultFractionDigits(), 0);
        NumberFormat format = NumberFormat.getCurrencyInstance("INR".equals(currencyCode) ? INDIA : Locale.US);
        format.setCurrency(currency);
        format.setMinimumFractionDigits(exponent);
        format.setMaximumFractionDigits(exponent);
        return format.format(BigDecimal.valueOf(amountMinor, exponent));
    }
}
