package com.lms.order_service.models.context;

import com.lms.order_service.constants.ApplicationConstants;

/** Who is calling, taken from the verified access token plus the tenant header. */
public record OrderContext(String tenantId, String userId, String email, String name, String role) {

    public boolean isAdmin() {
        return ApplicationConstants.ROLE_ADMIN.equals(role);
    }
}
