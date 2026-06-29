package com.lms.notification_service.models.context;

public final class NotificationContextHolder {
    private static final ThreadLocal<NotificationContext> NOTIFICATION_CONTEXT_THREAD_LOCAL = new ThreadLocal<>();

    public static void setNotificationContext(NotificationContext notificationContext){
        NOTIFICATION_CONTEXT_THREAD_LOCAL.set(notificationContext);
    }

    public static NotificationContext getNotificationContext(){
        return NOTIFICATION_CONTEXT_THREAD_LOCAL.get();
    }

    public static void clear(){
        NOTIFICATION_CONTEXT_THREAD_LOCAL.remove();
    }

}
