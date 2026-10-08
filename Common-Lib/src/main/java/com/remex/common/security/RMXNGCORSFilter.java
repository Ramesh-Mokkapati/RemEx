package com.remex.common.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CORS filter that enforces an explicit origin allowlist.
 *
 * <p>Allowed origins are read (comma-separated) from the
 * {@code CORS_ALLOWED_ORIGINS} environment variable, e.g.:
 * <pre>
 *   CORS_ALLOWED_ORIGINS=https://rmxstudio.example.com,https://admin.example.com
 * </pre>
 *
 * <p>If the variable is empty the filter falls back to
 * {@code http://localhost:3300} for local development only.
 * In production this variable MUST be set explicitly.
 *
 * <p>Order 0 ensures CORS headers are written before RateLimitingFilter (order 1)
 * and JwtFilter (order 2) so that even 401/429 responses reach the browser.
 */
@Component
@Order(0)
public class RMXNGCORSFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(RMXNGCORSFilter.class);

    private static final String DEFAULT_DEV_ORIGIN = "http://localhost:3300";

    private final Set<String> allowedOrigins;

    public RMXNGCORSFilter() {
        String raw = System.getenv("CORS_ALLOWED_ORIGINS");
        if (raw != null && !raw.trim().isEmpty()) {
            this.allowedOrigins = Arrays.stream(raw.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toSet());
            log.info("RMXNGCORSFilter: allowed origins = {}", this.allowedOrigins);
        } else {
            this.allowedOrigins = Collections.singleton(DEFAULT_DEV_ORIGIN);
            log.warn("RMXNGCORSFilter: CORS_ALLOWED_ORIGINS not set — " +
                     "defaulting to {} (development only). " +
                     "Set CORS_ALLOWED_ORIGINS in production.", DEFAULT_DEV_ORIGIN);
        }
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest  request  = (HttpServletRequest)  req;
        HttpServletResponse response = (HttpServletResponse) res;

        String origin = request.getHeader("Origin");

        if (origin != null && allowedOrigins.contains(origin)) {
            // Exact-match allowlist — never reflects arbitrary origins
            response.setHeader("Access-Control-Allow-Origin",      origin);
            response.setHeader("Access-Control-Allow-Credentials", "true");
            response.setHeader("Vary", "Origin");
        }
        // If the origin is not in the allowlist we simply omit the CORS headers;
        // the browser will block the response on its own.

        response.setHeader("Access-Control-Allow-Methods",
                "GET,HEAD,OPTIONS,POST,PUT,DELETE");
        response.setHeader("Access-Control-Max-Age", "3600");
        response.setHeader("Access-Control-Allow-Headers",
                "Origin, X-Requested-With, Content-Type, Accept, Authorization, ngrok-skip-browser-warning");
        response.setHeader("Access-Control-Expose-Headers",
                "Content-Disposition, Content-Length, Content-Type");

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_OK);
            return;
        }

        chain.doFilter(req, res);
    }

    @Override public void init(FilterConfig filterConfig) {}
    @Override public void destroy() {}
}
