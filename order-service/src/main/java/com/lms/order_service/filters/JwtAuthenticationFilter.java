package com.lms.order_service.filters;

import com.lms.order_service.config.AuthProperties;
import com.lms.order_service.config.OrderProperties;
import com.lms.order_service.constants.ApplicationConstants;
import com.lms.order_service.models.context.OrderContext;
import com.lms.order_service.models.context.OrderContextHolder;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * Authenticates buyer and admin routes. Webhooks are excluded by path: they are authenticated by
 * provider signature, never by a user token. Reads the Bearer header or the access_token cookie,
 * matching backend's dual-mode auth.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final List<String> PROTECTED_PREFIXES = List.of("/api/v1/orders", "/api/v1/admin");

    private final AccessTokenVerifier verifier;
    private final AuthProperties authProperties;
    private final OrderProperties orderProperties;

    public JwtAuthenticationFilter(AccessTokenVerifier verifier, AuthProperties authProperties,
                                   OrderProperties orderProperties) {
        this.verifier = verifier;
        this.authProperties = authProperties;
        this.orderProperties = orderProperties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // CORS preflights carry no credentials; CorsFilter answers them before this filter
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;
        String path = request.getRequestURI();
        return PROTECTED_PREFIXES.stream().noneMatch(path::startsWith);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Optional<AccessTokenVerifier.Claims> claims = verifier.verify(extractToken(request));
        if (claims.isEmpty()) {
            reject(response);
            return;
        }
        String tenantId = request.getHeader(ApplicationConstants.X_TENANT_ID);
        if (!StringUtils.hasText(tenantId)) tenantId = orderProperties.defaultTenant();

        AccessTokenVerifier.Claims c = claims.get();
        OrderContextHolder.set(new OrderContext(tenantId, c.userId(), c.email(), c.name(), c.role()));
        try {
            chain.doFilter(request, response);
        } finally {
            // pooled threads must never carry one request's identity into the next
            OrderContextHolder.clear();
        }
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return header.substring(7).trim();
        }
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        return Arrays.stream(cookies)
                .filter(cookie -> authProperties.accessTokenCookie().equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private static void reject(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"success\":false,\"error\":\"AUTH\",\"message\":\"Invalid or missing access token\"}");
    }
}
