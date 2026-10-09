package com.lms.notification_service.filters;

import com.lms.notification_service.models.context.NotificationContext;
import com.lms.notification_service.models.context.NotificationContextHolder;
import com.lms.notification_service.utils.CommonUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

import static com.lms.notification_service.constants.ApplicationConstants.X_TENANT_ID;

@Component
@Order(1)
public class NotificationApiFilter extends OncePerRequestFilter {

    // browsers do not know about tenants yet; service-to-service and admin calls must say
    @Value("${lms.notification.default-tenant:learnsphere}")
    private String defaultTenant;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        if (!request.getRequestURI().startsWith("/api")) {
            filterChain.doFilter(request, response);
            return;
        }
        // tenant-id check
        String tenantId = request.getHeader(X_TENANT_ID);
        if (!CommonUtils.isNotEmpty(tenantId) && request.getRequestURI().startsWith("/api/v1/devices")) {
            tenantId = defaultTenant;
        }
        if (!CommonUtils.isNotEmpty(tenantId)) {
            // unauthorized connection
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.getWriter().write("Unauthorized! Tenant id is required.");
            return;
        }
        NotificationContextHolder.setNotificationContext(new NotificationContext(tenantId));
        try {
            filterChain.doFilter(request, response);
        } finally {
            // clear the thread
            NotificationContextHolder.clear();
        }
    }
}
