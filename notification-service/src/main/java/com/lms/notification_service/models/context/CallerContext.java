package com.lms.notification_service.models.context;

/** Who is calling: a signed-in user, an admin, or another service holding the internal key. */
public record CallerContext(String userId, String role, boolean internal) {

    public boolean isAdmin() {
        return internal || "ADMIN".equals(role);
    }
}
