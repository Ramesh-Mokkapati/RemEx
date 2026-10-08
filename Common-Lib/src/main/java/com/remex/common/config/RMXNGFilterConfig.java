package com.remex.common.config;

import com.remex.common.filter.IpWhitelistFilter;
import com.remex.common.filter.SecurityHeadersFilter;
import com.remex.common.filter.RMXNGJwtFilter;
import com.remex.common.security.AccountLockoutFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers the shared servlet filters for every RMX microservice.
 *
 * Filter execution order:
 *   order -2  SecurityHeadersFilter  : injects MITM/XSS/clickjacking response headers
 *   order -1  IpWhitelistFilter      : rejects non-whitelisted IPs before anything else
 *   order  0  RMXNGCORSFilter        : CORS headers
 *   order  1  RateLimitingFilter     : token-bucket rate limit
 *   order  1  AccountLockoutFilter   : brute-force protection on /login
 *   order  2  RMXNGJwtFilter         : JWT bearer-token validation (opt-out — see below)
 *
 * SecurityHeadersFilter runs first so that every response -- including 401/403
 * from the JWT filter -- carries the security headers.
 *
 * Public paths (login, probes, actuator) are excluded inside the filters
 * themselves, so adding a new public endpoint requires editing only the
 * relevant filter, not this registration class.
 */
@Configuration
public class RMXNGFilterConfig {

    /**
     * JWT signing key injected from jwtsecret in application.properties
     * which maps the JWT_SECRET environment variable.
     */
    @Value("${jwtsecret:}")
    private String jwtSecret;

    /**
     * Comma-separated allowed IP addresses / CIDR ranges.
     * Reads IP_WHITELIST via the Spring property ip.whitelist.
     *
     * Empty (default): filter is a no-op; all source IPs are permitted
     *   (current behaviour preserved).
     * Set: only requests from matching IPs/ranges pass; all others get
     *   HTTP 403 Forbidden before reaching any other filter.
     *
     * Example: ip.whitelist=192.168.1.0/24,10.0.0.0/8,172.16.5.42
     */
    @Value("${ip.whitelist:}")
    private String ipWhitelist;

    /**
     * HSTS max-age in seconds (default 31536000 = 1 year).
     * Reads security.hsts.max-age-seconds or HSTS_MAX_AGE_SECONDS env var.
     * Only applied on HTTPS responses (per RFC 6797).
     */
    @Value("${security.hsts.max-age-seconds:31536000}")
    private long hstsMaxAgeSeconds;

    /**
     * Security headers filter (order -2) -- runs before all other filters.
     * Sets HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection,
     * Cache-Control, and Referrer-Policy on every response to prevent
     * MITM, clickjacking, MIME-sniffing, and cache-based session attacks.
     */
    @Bean
    public FilterRegistrationBean<SecurityHeadersFilter> securityHeadersFilter() {
        FilterRegistrationBean<SecurityHeadersFilter> filter = new FilterRegistrationBean<>();
        filter.setFilter(new SecurityHeadersFilter(hstsMaxAgeSeconds));
        filter.addUrlPatterns("/*");
        filter.setOrder(-2);
        filter.setName("securityHeadersFilter");
        return filter;
    }

    /**
     * IP whitelist filter (order -1) -- runs before all other filters.
     * No-op when IP_WHITELIST is not configured.
     */
    @Bean
    public FilterRegistrationBean<IpWhitelistFilter> ipWhitelistFilter() {
        FilterRegistrationBean<IpWhitelistFilter> filter = new FilterRegistrationBean<>();
        filter.setFilter(new IpWhitelistFilter(ipWhitelist));
        filter.addUrlPatterns("/*");
        filter.setOrder(-1);
        filter.setName("ipWhitelistFilter");
        return filter;
    }

    /**
     * Account lockout filter (order 1) -- brute-force protection on the login endpoint.
     */
    @Bean
    public FilterRegistrationBean<AccountLockoutFilter> accountLockoutFilter() {
        FilterRegistrationBean<AccountLockoutFilter> filter = new FilterRegistrationBean<>();
        filter.setFilter(new AccountLockoutFilter());
        filter.addUrlPatterns("/v1/rmxams/login");
        filter.setOrder(1);
        filter.setName("accountLockoutFilter");
        return filter;
    }

    /**
     * JWT bearer-token filter (order 2) -- validates every request except public paths.
     *
     * Set JWT_FILTER_ENABLED=false (jwt.filter.enabled=false) to disable this
     * filter entirely — e.g. for a no-login prototype build where there is no
     * credential-issuing Authentication service to obtain a token from in the
     * first place. Defaults to enabled (matchIfMissing=true) so production
     * deployments are unaffected unless explicitly opted out.
     */
    @Bean
    @ConditionalOnProperty(name = "jwt.filter.enabled", havingValue = "true", matchIfMissing = true)
    public FilterRegistrationBean<RMXNGJwtFilter> jwtFilter() {
        FilterRegistrationBean<RMXNGJwtFilter> filter = new FilterRegistrationBean<>();
        filter.setFilter(new RMXNGJwtFilter(jwtSecret));
        filter.addUrlPatterns("/*");
        filter.setOrder(2);
        filter.setName("jwtFilter");
        return filter;
    }
}
