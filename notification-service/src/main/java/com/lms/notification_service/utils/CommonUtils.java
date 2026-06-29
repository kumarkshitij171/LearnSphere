package com.lms.notification_service.utils;

import org.springframework.util.ObjectUtils;

import java.util.Calendar;

public final class CommonUtils {

    private static final Calendar CALENDAR = Calendar.getInstance();

    public static boolean isNotEmpty(final Object input){
        return ObjectUtils.isEmpty(input);
    }

    public static long getCurrentTimeStamp(){
        return CALENDAR.getTimeInMillis();
    }

}
