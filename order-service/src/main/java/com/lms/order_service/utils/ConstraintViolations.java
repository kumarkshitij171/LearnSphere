package com.lms.order_service.utils;

/** Tells which unique index a write lost to, so a lost race is answered and anything else rethrown. */
public final class ConstraintViolations {

    private ConstraintViolations() {
    }

    public static boolean isViolationOf(Throwable error, String... constraintNames) {
        for (Throwable t = error; t != null; t = t.getCause()) {
            String message = t.getMessage();
            if (message == null) continue;
            for (String name : constraintNames) {
                if (message.contains(name)) return true;
            }
            if (t.getCause() == t) break;
        }
        return false;
    }
}
