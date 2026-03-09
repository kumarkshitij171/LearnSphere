package com.lms.notification_service.utils;

import org.springframework.util.ObjectUtils;

public final class CommonUtils {

    public static boolean isNotEmpty(final Object input){
        return ObjectUtils.isEmpty(input);
    }

}
