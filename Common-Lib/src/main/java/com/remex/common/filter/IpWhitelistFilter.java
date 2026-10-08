package com.remex.common.filter;

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
import java.net.InetAddress;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Servlet filter that enforces a configurable IP address whitelist.
 *
 * Behaviour:
 *   No configuration (IP_WHITELIST unset or empty): filter is a no-op,
 *     all requests pass through unchanged (current default behaviour preserved).
 *   Whitelist configured: only requests whose resolved client IP matches at
 *     least one entry are forwarded. All other requests are rejected with
 *     HTTP 403 Forbidden before reaching the JWT filter or any controller.
 *
 * Configuration:
 *   IP_WHITELIST env var (or Spring property ip.whitelist), comma-separated:
 *     - Exact IP:   192.168.1.100
 *     - IPv4 CIDR:  192.168.1.0/24
 *     - IPv6 CIDR:  ::1/128
 *   Example: IP_WHITELIST=192.168.1.0/24,10.0.0.0/8,172.16.5.42
 *
 * Client IP resolution honours X-Forwarded-For only when the direct remote
 * address is listed in TRUSTED_PROXY_IPS (same safeguard as RateLimitingFilter).
 *
 * Note: CIDR matching uses java.net.InetAddress (JDK only, no extra deps).
 */
public class IpWhitelistFilter extends GenericFilterBean {

    private static final Logger log = LoggerFactory.getLogger(IpWhitelistFilter.class);

    private final boolean enabled;
    private final List<String> entries;   // raw CIDR / IP strings for logging
    private final Set<String>  trustedProxyIps;

    public IpWhitelistFilter(String ipWhitelist) {
        this.trustedProxyIps = loadTrustedProxies();

        if (ipWhitelist == null || ipWhitelist.trim().isEmpty()) {
            this.enabled = false;
            this.entries = Collections.emptyList();
            log.info("IpWhitelistFilter: disabled -- IP_WHITELIST not configured, all source IPs permitted");
        } else {
            this.entries = Arrays.stream(ipWhitelist.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toList());
            this.enabled = !entries.isEmpty();
            log.info("IpWhitelistFilter: enabled -- enforcing {} whitelisted range(s): {}",
                    entries.size(), ipWhitelist.trim());
        }
    }

    @Override
    public void doFilter(ServletRequest servletRequest, ServletResponse servletResponse,
                         FilterChain chain) throws IOException, ServletException {

        if (!enabled) {
            chain.doFilter(servletRequest, servletResponse);
            return;
        }

        HttpServletRequest  request  = (HttpServletRequest)  servletRequest;
        HttpServletResponse response = (HttpServletResponse) servletResponse;
        final String clientIp = resolveClientIp(request);

        if (isAllowed(clientIp)) {
            chain.doFilter(request, response);
        } else {
            log.warn("IpWhitelistFilter: BLOCKED {} {} -- IP {} is not whitelisted",
                    request.getMethod(), request.getRequestURI(), clientIp);
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    "{\"status\":403,\"error\":\"Forbidden\"," +
                    "\"message\":\"Access denied: your IP address is not permitted.\"}");
        }
    }

    // -----------------------------------------------------------------------

    private boolean isAllowed(String ip) {
        for (String entry : entries) {
            try {
                if (matchesCidrOrIp(entry, ip)) return true;
            } catch (Exception e) {
                log.warn("IpWhitelistFilter: error evaluating entry '{}' against IP '{}': {}",
                        entry, ip, e.getMessage());
            }
        }
        return false;
    }

    /**
     * Matches an exact IP or a CIDR range against a client IP address.
     * Works for both IPv4 and IPv6 using java.net.InetAddress (no extra deps).
     */
    private static boolean matchesCidrOrIp(String cidrOrIp, String clientIp) throws Exception {
        if (!cidrOrIp.contains("/")) {
            // Exact address comparison (normalises IPv6 representations)
            return InetAddress.getByName(cidrOrIp).equals(InetAddress.getByName(clientIp));
        }

        String[] parts   = cidrOrIp.split("/", 2);
        int      prefix  = Integer.parseInt(parts[1]);
        byte[]   network = InetAddress.getByName(parts[0]).getAddress();
        byte[]   addr    = InetAddress.getByName(clientIp).getAddress();

        if (network.length != addr.length) {
            return false; // IPv4 vs IPv6 mismatch
        }

        int fullBytes     = prefix / 8;
        int remainingBits = prefix % 8;

        for (int i = 0; i < fullBytes; i++) {
            if (network[i] != addr[i]) return false;
        }
        if (remainingBits > 0 && fullBytes < network.length) {
            int mask = 0xFF & (0xFF << (8 - remainingBits));
            if ((network[fullBytes] & mask) != (addr[fullBytes] & mask)) return false;
        }
        return true;
    }

    private String resolveClientIp(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (!trustedProxyIps.isEmpty() && trustedProxyIps.contains(remoteAddr)) {
            String xff = request.getHeader("X-Forwarded-For");
            if (xff != null && !xff.trim().isEmpty()) {
                return xff.split(",")[0].trim();
            }
        }
        return remoteAddr;
    }

    private static Set<String> loadTrustedProxies() {
        String raw = System.getenv("TRUSTED_PROXY_IPS");
        if (raw == null || raw.trim().isEmpty()) return Collections.emptySet();
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
    }
}
