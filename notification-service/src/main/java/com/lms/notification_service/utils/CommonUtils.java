package com.lms.notification_service.utils;

import org.springframework.util.ObjectUtils;

public final class CommonUtils {

    private CommonUtils() {
    }

    public static boolean isNotEmpty(final Object input) {
        return !ObjectUtils.isEmpty(input);
    }

    public static long getCurrentTimeStamp() {
        return System.currentTimeMillis();
    }

}
