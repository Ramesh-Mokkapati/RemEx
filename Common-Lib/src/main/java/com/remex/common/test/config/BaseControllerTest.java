package com.remex.common.test.config;


import static com.github.stefanbirkner.systemlambda.SystemLambda.withEnvironmentVariable;

public abstract class BaseControllerTest {
    protected void withJwtEnvVars(Runnable runnable) throws Exception {
        // HS512 requires >= 512 bits (64 chars). "secret" is too short and throws WeakKeyException.
        withEnvironmentVariable("JWT_SECRET", "test-secret-key-for-unit-tests-must-be-at-least-64-characters-long!")
                .and("JWT_COOKIENAME", "RemExService")
                .and("JWT_EXPIRATION_MS", "86400000")
                .execute(runnable::run);
    }
}
