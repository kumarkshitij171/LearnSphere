package com.lms.notification_service.filters;

import com.lms.notification_service.models.context.CallerContext;
import com.lms.notification_service.models.context.CallerContextHolder;
import com.lms.notification_service.security.AccessTokenVerifier;
import com.lms.notification_service.security.AuthProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Optional;

/**
 * Two audiences. /api/v1/devices is called by browsers: any signed-in user, acting only for
 * themselves. Everything else under /api can send mail to anyone, so it needs an ADMIN token or
 * the internal API key another service holds. Runs after the tenant filter.
 */
@Component
@Order(2)
public class ApiAuthFilter extends OncePerRequestFilter {

    static final String DEVICES = "/api/v1/devices";
    static final String INTERNAL_KEY_HEADER = "X-Internal-Api-Key";

    private final AccessTokenVerifier verifier;
    private final AuthProperties props;

    public ApiAuthFilter(AccessTokenVerifier verifier, AuthProperties props) {
        this.verifier = verifier;
        this.props = props;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api") || "OPTIONS".equalsIgnoreCase(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean deviceRoute = request.getRequestURI().startsWith(DEVICES);
        Optional<CallerContext> caller = internalCaller(request).or(() -> userCaller(request));

        if (caller.isEmpty()) {
            reject(response, HttpStatus.UNAUTHORIZED, "Invalid or missing credentials");
            return;
        }
        if (!deviceRoute && !caller.get().isAdmin()) {
            reject(response, HttpStatus.FORBIDDEN, "Admin access required");
            return;
        }
        CallerContextHolder.set(caller.get());
        try {
            chain.doFilter(request, response);
        } finally {
            CallerContextHolder.clear();
        }
    }

    private Optional<CallerContext> internalCaller(HttpServletRequest request) {
        String presented = request.getHeader(INTERNAL_KEY_HEADER);
        if (presented == null) return Optional.empty();
        boolean ok = MessageDigest.isEqual(presented.getBytes(StandardCharsets.UTF_8),
                props.internalApiKey().getBytes(StandardCharsets.UTF_8));
        return ok ? Optional.of(new CallerContext(null, null, true)) : Optional.empty();
    }

    private Optional<CallerContext> userCaller(HttpServletRequest request) {
        return verifier.verify(extractToken(request))
                .map(claims -> new CallerContext(claims.userId(), claims.role(), false));
    }

    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) return header.substring(7).trim();
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        return Arrays.stream(cookies)
                .filter(cookie -> props.accessTokenCookie().equals(cookie.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private static void reject(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"success\":false,\"message\":\"" + message + "\"}");
    }
}
