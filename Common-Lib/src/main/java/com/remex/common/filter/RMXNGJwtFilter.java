package com.remex.common.filter;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import io.jsonwebtoken.security.SignatureException;
import io.jsonwebtoken.security.Keys;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.filter.GenericFilterBean;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * JWT bearer-token filter.
 *
 * <p>The signing key is read (in priority order) from:
 * <ol>
 *   <li>Constructor argument (supplied by {@code RMXNGFilterConfig} via {@code @Value})</li>
 *   <li>System property {@code jwtsecret}</li>
 *   <li>Environment variable {@code JWT_SECRET}</li>
 * </ol>
 *
 * <p>Paths that bypass the filter entirely (no token required):
 * <ul>
 *   <li>{@code /v1/rmxams/login}  – credential exchange</li>
 *   <li>{@code /probe/**}         – liveness / readiness / restart probes</li>
 *   <li>{@code /actuator/**}      – Spring Boot management (protected separately)</li>
 * </ul>
 *
 * <p>All {@code OPTIONS} pre-flight requests are always passed through so CORS
 * headers can be set before the filter responds.
 */
public class RMXNGJwtFilter extends GenericFilterBean {

    private static final Logger log = LoggerFactory.getLogger(RMXNGJwtFilter.class);

    /** Exact paths that never require a JWT. Add new public endpoints here. */
    private static final Set<String> EXCLUDED_PATHS = new HashSet<>(Arrays.asList(
            "/",               // root info endpoint (app name, version, date)
            "/v1/rmxams/login" // credential exchange
    ));

    private static final String[] EXCLUDED_PREFIXES = {
            "/probe/",
            "/actuator/"
    };

    private final String signingKey;

    public RMXNGJwtFilter(String signingKey) {
        this.signingKey = resolveKey(signingKey);
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse,
                         FilterChain filterChain) throws IOException, ServletException {

        final HttpServletRequest  request  = (HttpServletRequest)  servletRequest;
        final HttpServletResponse response = (HttpServletResponse) servletResponse;
        final String path = request.getRequestURI();

        // Always pass through CORS preflight
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            response.setStatus(HttpServletResponse.SC_OK);
            filterChain.doFilter(request, response);
            return;
        }

        // Public paths — no token required
        if (isExcluded(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        final String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            sendUnauthorized(response, "Missing or invalid Authorization header.");
            return;
        }

        final String token = authHeader.substring(7);
        try {
            // jjwt 0.12: parserBuilder() enforces the algorithm; rejectJwtWithHeader()
            // ensures alg:none tokens are rejected even before signature validation.
            Claims claims = Jwts.parser()
                    .verifyWith(Keys.hmacShaKeyFor(signingKey.getBytes(java.nio.charset.StandardCharsets.UTF_8)))
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            request.setAttribute("claims", claims);
            filterChain.doFilter(request, response);
        } catch (ExpiredJwtException e) {
            log.warn("Expired JWT for {}: {}", path, e.getMessage());
            sendUnauthorized(response, "Token has expired.");
        } catch (SignatureException | MalformedJwtException e) {
            log.warn("Invalid JWT for {}: {}", path, e.getMessage());
            sendUnauthorized(response, "Invalid token.");
        } catch (Exception e) {
            log.error("JWT validation error for {}", path, e);
            sendUnauthorized(response, "Authentication error.");
        }
    }

    // -----------------------------------------------------------------------

    private boolean isExcluded(String path) {
        if (EXCLUDED_PATHS.contains(path)) return true;
        for (String prefix : EXCLUDED_PREFIXES) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }

    private void sendUnauthorized(HttpServletResponse response, String message) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"status\":401,\"error\":\"Unauthorized\",\"message\":\"" + message + "\"}");
    }

    /**
     * Resolves the signing key from the constructor argument, then system
     * property, then environment variable.  Fails fast if none is found so a
     * misconfigured service won't silently accept unsigned tokens.
     */
    private static String resolveKey(String constructorKey) {
        if (constructorKey != null && !constructorKey.trim().isEmpty()) {
            return constructorKey.trim();
        }
        String sysProp = System.getProperty("jwtsecret");
        if (sysProp != null && !sysProp.trim().isEmpty()) {
            return sysProp.trim();
        }
        String envVar = System.getenv("JWT_SECRET");
        if (envVar != null && !envVar.trim().isEmpty()) {
            return envVar.trim();
        }
        throw new IllegalStateException(
                "JWT signing key is not configured. Set the JWT_SECRET environment variable.");
    }
}
