package com.remex.common.ratelimit;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Bucket4j;
import io.github.bucket4j.ConsumptionProbe;
import io.github.bucket4j.Refill;
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
import java.time.Duration;
import java.util.Arrays;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * Servlet filter that applies per-IP token-bucket rate limiting via Bucket4j.
 *
 * <p>Defaults (all overridable via application.properties / environment):
 * <ul>
 *   <li>{@code rate.limit.capacity}               – bucket capacity (default 200)</li>
 *   <li>{@code rate.limit.refill-tokens}           – tokens refilled per window (default 200)</li>
 *   <li>{@code rate.limit.refill-duration-seconds} – refill window in seconds (default 60)</li>
 *   <li>{@code rate.limit.enabled}                 – toggle on/off (default true)</li>
 * </ul>
 *
 * <p>{@code X-Forwarded-For} is only honoured when the direct remote address
 * matches an entry in {@code TRUSTED_PROXY_IPS} (comma-separated env var).
 * Without that list, the direct remote address is always used, preventing
 * IP spoofing attacks against the rate limiter.
 *
 * <p>{@code /actuator/**} endpoints are always bypassed.
 */
public class RateLimitingFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitingFilter.class);

    private static final String[] EXEMPT_PREFIXES = { "/actuator" };

    /**
     * LRU cache with TTL eviction — prevents unbounded memory growth when an
     * attacker cycles through millions of unique source IPs.
     * Cap: 100,000 unique IPs; each bucket expires 10 minutes after last access.
     */
    private final Cache<String, Bucket> buckets = Caffeine.newBuilder()
            .maximumSize(100_000)
            .expireAfterAccess(10, TimeUnit.MINUTES)
            .build();

    private final boolean enabled;
    private final long capacity;
    private final long refillTokens;
    private final long refillDurationSeconds;

    /**
     * Trusted reverse-proxy IPs whose {@code X-Forwarded-For} we honour.
     * Populated from {@code TRUSTED_PROXY_IPS} env var (comma-separated).
     * If unset, XFF is never trusted.
     */
    private final Set<String> trustedProxyIps;

    public RateLimitingFilter(boolean enabled, long capacity, long refillTokens,
                              long refillDurationSeconds) {
        this.enabled              = enabled;
        this.capacity             = capacity;
        this.refillTokens         = refillTokens;
        this.refillDurationSeconds = refillDurationSeconds;
        this.trustedProxyIps      = loadTrustedProxies();
        log.info("RateLimitingFilter initialised – enabled={}, capacity={}, refill={} tokens/{}s, trustedProxies={}",
                enabled, capacity, refillTokens, refillDurationSeconds, trustedProxyIps);
    }

    @Override
    public void init(FilterConfig filterConfig) {}

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse,
                         FilterChain chain) throws IOException, ServletException {

        HttpServletRequest  request  = (HttpServletRequest)  servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;

        if (!enabled || isExempt(request)) {
            chain.doFilter(request, response);
            return;
        }

        String clientIp = resolveClientIp(request);
        Bucket bucket   = buckets.get(clientIp, this::newBucket);

        ConsumptionProbe probe = bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            chain.doFilter(request, response);
        } else {
            long waitSeconds = probe.getNanosToWaitForRefill() / 1_000_000_000L + 1;
            log.warn("Rate limit exceeded for IP {} on {}", clientIp, request.getRequestURI());
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setHeader("Retry-After", String.valueOf(waitSeconds));
            response.getWriter().write(
                    "{\"status\":429,\"error\":\"Too Many Requests\"," +
                    "\"message\":\"Rate limit exceeded. Retry after " + waitSeconds + " seconds.\"}");
        }
    }

    @Override
    public void destroy() {
        buckets.invalidateAll();
    }

    // -----------------------------------------------------------------------

    private Bucket newBucket(String ip) {
        Bandwidth limit = Bandwidth.classic(
                capacity,
                Refill.greedy(refillTokens, Duration.ofSeconds(refillDurationSeconds)));
        return Bucket4j.builder().addLimit(limit).build();
    }

    /**
     * Resolves the real client IP.
     *
     * <p>{@code X-Forwarded-For} is only used when the direct remote address is a
     * known trusted proxy (configured via {@code TRUSTED_PROXY_IPS}).  Without that
     * safeguard any client can spoof the header and get an unlimited number of fresh
     * rate-limit buckets.
     */
    private String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (!trustedProxyIps.isEmpty() && trustedProxyIps.contains(remoteAddr)) {
            String xff = request.getHeader("X-Forwarded-For");
            if (xff != null && !xff.trim().isEmpty()) {
                // XFF is a comma-separated list; the leftmost entry is the originating client
                return xff.split(",")[0].trim();
            }
        }
        return remoteAddr;
    }

    private boolean isExempt(HttpServletRequest request) {
        String path = request.getRequestURI();
        for (String prefix : EXEMPT_PREFIXES) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }

    private static Set<String> loadTrustedProxies() {
        String raw = System.getenv("TRUSTED_PROXY_IPS");
        if (raw == null || raw.trim().isEmpty()) {
            return Collections.emptySet();
        }
        Set<String> ips = Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
        log.info("Trusted proxy IPs for XFF: {}", ips);
        return ips;
    }
}
