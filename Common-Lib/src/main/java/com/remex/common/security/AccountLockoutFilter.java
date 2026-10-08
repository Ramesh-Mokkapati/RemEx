package com.remex.common.security;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

import javax.servlet.Filter;
import javax.servlet.FilterChain;
import javax.servlet.FilterConfig;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Servlet filter that imposes a per-username login-attempt lockout.
 *
 * <p>Only applies to the login endpoint ({@code /v1/rmxams/login}).
 * After {@code MAX_FAILURES} consecutive failed attempts the account is locked
 * for {@code LOCKOUT_MINUTES} minutes.  A successful login resets the counter.
 *
 * <p>Defaults:
 * <ul>
 *   <li>{@code LOCKOUT_MAX_FAILURES}  env var – max consecutive failures before lock (default 5)</li>
 *   <li>{@code LOCKOUT_MINUTES}       env var – lockout duration in minutes (default 15)</li>
 * </ul>
 */
public class AccountLockoutFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(AccountLockoutFilter.class);

    private static final String LOGIN_PATH = "/v1/rmxams/login";

    private final int maxFailures;
    private final long lockoutMinutes;

    /** Tracks consecutive failures per username; expires after lockout period. */
    private final Cache<String, AtomicInteger> failureCache;

    public AccountLockoutFilter() {
        this.maxFailures    = intEnv("LOCKOUT_MAX_FAILURES", 5);
        this.lockoutMinutes = intEnv("LOCKOUT_MINUTES", 15);
        this.failureCache   = Caffeine.newBuilder()
                .maximumSize(50_000)
                .expireAfterWrite(lockoutMinutes, TimeUnit.MINUTES)
                .build();
        log.info("AccountLockoutFilter: max {} failures, lockout {} min", maxFailures, lockoutMinutes);
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest  request  = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        // Only intercept POST login; everything else passes through
        if (!"POST".equalsIgnoreCase(request.getMethod()) ||
            !LOGIN_PATH.equals(request.getRequestURI())) {
            chain.doFilter(req, res);
            return;
        }

        // Read username parameter (form or JSON body peek not possible without buffering;
        // use the 'username' request parameter which Spring's filter chain exposes)
        String username = request.getParameter("username");
        if (username == null || username.trim().isEmpty()) {
            // No username supplied — let the auth controller reject it normally
            chain.doFilter(req, res);
            return;
        }

        username = username.trim().toLowerCase();

        AtomicInteger failures = failureCache.getIfPresent(username);
        if (failures != null && failures.get() >= maxFailures) {
            log.warn("Account locked out: {}", username);
            sendLocked(response, lockoutMinutes);
            return;
        }

        // Wrap response to intercept the status code
        StatusCapturingResponseWrapper wrapper = new StatusCapturingResponseWrapper(response);
        chain.doFilter(request, wrapper);

        int status = wrapper.getStatus();
        if (status == HttpServletResponse.SC_UNAUTHORIZED || status == HttpServletResponse.SC_FORBIDDEN) {
            AtomicInteger counter = failureCache.get(username, k -> new AtomicInteger(0));
            int count = counter.incrementAndGet();
            log.warn("Failed login attempt {}/{} for user '{}'", count, maxFailures, username);
            if (count >= maxFailures) {
                log.warn("Account '{}' locked for {} minutes after {} failures", username, lockoutMinutes, maxFailures);
            }
        } else if (status == HttpServletResponse.SC_OK) {
            // Successful login — clear the failure counter
            failureCache.invalidate(username);
        }
    }

    @Override public void init(FilterConfig filterConfig) {}
    @Override public void destroy() { failureCache.invalidateAll(); }

    private void sendLocked(HttpServletResponse response, long lockoutMins) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        try (PrintWriter w = response.getWriter()) {
            w.write("{\"status\":429,\"error\":\"Account Locked\",\"message\":\"Too many failed login attempts. " +
                    "Account locked for " + lockoutMins + " minutes.\"}");
        }
    }

    private static int intEnv(String key, int def) {
        String v = System.getenv(key);
        if (v == null || v.trim().isEmpty()) return def;
        try { return Integer.parseInt(v.trim()); } catch (NumberFormatException e) { return def; }
    }

    // -----------------------------------------------------------------------
    // Minimal response wrapper to capture the HTTP status without consuming the body
    // -----------------------------------------------------------------------

    private static class StatusCapturingResponseWrapper extends javax.servlet.http.HttpServletResponseWrapper {
        private int status = HttpServletResponse.SC_OK;

        StatusCapturingResponseWrapper(HttpServletResponse response) { super(response); }

        @Override public void setStatus(int sc)              { this.status = sc; super.setStatus(sc); }
        @Override public void sendError(int sc) throws IOException { this.status = sc; super.sendError(sc); }
        @Override public void sendError(int sc, String msg) throws IOException { this.status = sc; super.sendError(sc, msg); }
        @Override public int getStatus() { return status; }
    }
}
