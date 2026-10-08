package com.remex.common.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.filter.GenericFilterBean;

import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

/**
 * Servlet filter that injects security response headers on every reply.
 *
 * <p>These headers address the MITM-relevant protections described in the
 * Spring Security reference (section 13.2 "Security HTTP Response Headers"):
 *
 * <ul>
 *   <li><b>Strict-Transport-Security (HSTS)</b> -- tells the browser to always
 *       use HTTPS for this host, preventing HTTP-downgrade MITM attacks.
 *       Only sent on HTTPS responses (per RFC 6797 section 7.2).</li>
 *   <li><b>X-Content-Type-Options: nosniff</b> -- prevents MIME-sniffing,
 *       which can turn harmless files into executable content.</li>
 *   <li><b>X-Frame-Options: DENY</b> -- blocks clickjacking via iframe
 *       embedding.</li>
 *   <li><b>X-XSS-Protection: 1; mode=block</b> -- activates the browser's
 *       built-in reflected-XSS filter.</li>
 *   <li><b>Cache-Control / Pragma / Expires</b> -- prevents authenticated
 *       responses from being stored in browser or proxy caches, so a logged-out
 *       user cannot see a prior session via Back/History.</li>
 *   <li><b>Referrer-Policy: strict-origin-when-cross-origin</b> -- stops
 *       the browser leaking full URLs (which may contain tokens or IDs) to
 *       cross-origin destinations.</li>
 * </ul>
 *
 * <p>This filter runs at order -2, before {@link IpWhitelistFilter} (-1),
 * CORS (0), rate-limiting (1), and JWT (2).  Because headers are set on the
 * response object <em>before</em> calling {@code chain.doFilter()}, they are
 * present on every response that any downstream filter writes -- including
 * 401 Unauthorized, 403 Forbidden, and 429 Too Many Requests.
 *
 * <p>The HSTS {@code max-age} defaults to 1 year (31,536,000 seconds).
 * Override via the {@code security.hsts.max-age-seconds} Spring property or
 * the {@code HSTS_MAX_AGE_SECONDS} environment variable.
 */
public class SecurityHeadersFilter extends GenericFilterBean {

    private static final Logger log = LoggerFactory.getLogger(SecurityHeadersFilter.class);

    /** HSTS max-age in seconds (default 1 year). */
    private final long hstsMaxAgeSeconds;

    public SecurityHeadersFilter(long hstsMaxAgeSeconds) {
        this.hstsMaxAgeSeconds = hstsMaxAgeSeconds;
        log.info("SecurityHeadersFilter: active — HSTS max-age={}s (HTTPS responses only)",
                hstsMaxAgeSeconds);
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse,
                         FilterChain chain) throws IOException, ServletException {

        HttpServletRequest  request  = (HttpServletRequest)  servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        // ── Prevent MIME-type sniffing (XSS via polyglot files) ──────────────
        response.setHeader("X-Content-Type-Options", "nosniff");

        // ── Block clickjacking via iframe embedding ───────────────────────────
        response.setHeader("X-Frame-Options", "DENY");

        // ── Activate browser reflected-XSS filter ────────────────────────────
        response.setHeader("X-XSS-Protection", "1; mode=block");

        // ── Prevent caching of authenticated responses ────────────────────────
        response.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
        response.setHeader("Pragma",        "no-cache");
        response.setHeader("Expires",       "0");

        // ── Limit referrer leakage to same-origin on cross-origin requests ────
        response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

        // ── HSTS: force HTTPS on future visits (only valid on HTTPS responses) ─
        // Per RFC 6797 s7.2, HSTS must only be sent over a secure channel.
        if (isSecure(request)) {
            response.setHeader("Strict-Transport-Security",
                    "max-age=" + hstsMaxAgeSeconds + "; includeSubDomains");
        }

        chain.doFilter(request, response);
    }

    /**
     * Returns true when the connection is HTTPS -- either natively or because
     * a trusted reverse proxy set the X-Forwarded-Proto header.
     */
    private boolean isSecure(HttpServletRequest request) {
        if (request.isSecure()) {
            return true;
        }
        // Honour X-Forwarded-Proto set by a trusted reverse proxy (nginx, ALB, etc.)
        String proto = request.getHeader("X-Forwarded-Proto");
        return "https".equalsIgnoreCase(proto);
    }
}
