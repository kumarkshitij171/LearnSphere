package com.lms.notification_service.filters;

import com.lms.notification_service.models.context.NotificationContext;
import com.lms.notification_service.models.context.NotificationContextHolder;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

import static com.lms.notification_service.constants.ApplicationConstants.X_TENANT_ID;

public class NotificationApiFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        if(request.getRequestURI().startsWith("/api")){
            // tenant-id check
            String tenantId = request.getHeader(X_TENANT_ID);
            if(tenantId.isEmpty()){
                // unauthorized connection
                response.setStatus(HttpStatus.UNAUTHORIZED.value());
                response.getWriter().write("Unauthorized! Tenant id is required.");
            }
            NotificationContextHolder.setNotificationContext(new NotificationContext(tenantId));
        }
        filterChain.doFilter(request,response);
        // clear the thread
        if(request.getRequestURI().startsWith("/api")){
            NotificationContextHolder.clear();
        }
    }
}
