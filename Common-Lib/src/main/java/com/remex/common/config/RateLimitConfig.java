package com.remex.common.config;

import com.remex.common.ratelimit.RateLimitingFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Registers {@link RateLimitingFilter} for all URL patterns on every microservice
 * that pulls in Common-Lib.
 *
 * <p>Override any of these properties in a service's {@code application.properties}:
 * <pre>
 * rate.limit.enabled                 = true
 * rate.limit.capacity                = 200
 * rate.limit.refill-tokens           = 200
 * rate.limit.refill-duration-seconds = 60
 * </pre>
 */
@Configuration
public class RateLimitConfig {

    /** Master switch – set to false to disable without removing the filter bean. */
    @Value("${rate.limit.enabled:true}")
    private boolean enabled;

    /** Maximum number of tokens the bucket can hold (i.e. burst capacity). */
    @Value("${rate.limit.capacity:200}")
    private long capacity;

    /** Number of tokens added to the bucket each refill window. */
    @Value("${rate.limit.refill-tokens:200}")
    private long refillTokens;

    /** Length of the refill window in seconds. */
    @Value("${rate.limit.refill-duration-seconds:60}")
    private long refillDurationSeconds;

    @Bean
    public FilterRegistrationBean<RateLimitingFilter> rateLimitingFilterRegistration() {
        RateLimitingFilter filter = new RateLimitingFilter(enabled, capacity, refillTokens, refillDurationSeconds);

        FilterRegistrationBean<RateLimitingFilter> registration = new FilterRegistrationBean<>(filter);
        registration.addUrlPatterns("/*");
        // Order 1 ensures rate limiting runs before the JWT filter (order 2+)
        registration.setOrder(1);
        registration.setName("rateLimitingFilter");
        return registration;
    }
}
