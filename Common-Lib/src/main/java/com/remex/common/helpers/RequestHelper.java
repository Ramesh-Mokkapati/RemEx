package com.remex.common.helpers;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.http.HttpHeaders;

import javax.crypto.SecretKey;
import javax.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;

public class RequestHelper {

    private final String JWT_Token;
    private final String JWT_Secret;

    public RequestHelper(HttpServletRequest request) {
        String authHeader = request.getHeader(HttpHeaders.AUTHORIZATION);
        this.JWT_Token = (authHeader != null && authHeader.startsWith("Bearer "))
                ? authHeader.substring(7)
                : "";
        this.JWT_Secret = System.getenv("JWT_SECRET");
    }

    /** Extract the username claim from the bearer token using the jjwt 0.12 API. */
    public String GetUserNameFromJWT() {
        if (JWT_Token == null || JWT_Token.isEmpty() || JWT_Secret == null || JWT_Secret.isEmpty()) {
            return "anonymous";
        }
        try {
            SecretKey key = Keys.hmacShaKeyFor(JWT_Secret.getBytes(StandardCharsets.UTF_8));
            return Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(JWT_Token)
                    .getPayload()
                    .getSubject();
        } catch (Exception e) {
            return "anonymous";
        }
    }

    public String getJWT_Token() {
        return JWT_Token;
    }
}
