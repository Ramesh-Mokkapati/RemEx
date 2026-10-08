package com.remex.common.test.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

public class JwtUtilForTests {

    /**
     * Shared test signing secret — must be ≥ 64 ASCII characters (512 bits)
     * to satisfy HS512 minimum key-size requirements (RFC 7518 §3.2).
     * Must match the {@code jwtsecret} property in each service's test
     * application.properties so the JWT filter accepts generated tokens.
     */
    public static final String TEST_SECRET =
            "rmx-test-secret-key-for-unit-testing-purposes-only-minimum-64ch!";

    public static String generateToken() {
        long nowMillis = System.currentTimeMillis();
        Date now    = new Date(nowMillis);
        Date expiry = new Date(nowMillis + 3_600_000L); // 1 hour (was 3600ms — a bug)

        SecretKey key = Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8));

        return Jwts.builder()
                .subject("test")
                .issuedAt(now)
                .expiration(expiry)
                .claim("roles", "ROLE_ADMINISTRATOR")
                .signWith(key)
                .compact();
    }
}
