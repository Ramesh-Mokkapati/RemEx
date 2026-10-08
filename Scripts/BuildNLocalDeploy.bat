@echo off

REM Navigate to repository root so all relative paths work correctly.
cd /d "%~dp0.."
setlocal enabledelayedexpansion

set RMXBIN=C:/RMX
set APP_HOME=C:/RMX
set RMXDATA=C:/RMX
set NEXT_PUBLIC_RMXDATA=%RMXDATA%
set RMX_HOST=localhost
set RMX_KEYSTORE_KEY_ALIAS=convert-auth-cert
set RMX_ENABLE_HTTPS=false

set LOGGING_FILE_MAX_SIZE=100MB
set LOGGING_FILE_MAX_HISTORY=30
set LOGGING_FILE_DIRECTORY=./

REM ## Account Lockout
set LOCKOUT_MAX_FAILURES=5
set LOCKOUT_MINUTES=15

REM ## Rate Limiting (applied to all microservices)
set RATE_LIMIT_ENABLED=true
set RATE_LIMIT_CAPACITY=200
set RATE_LIMIT_REFILL_TOKENS=200
set RATE_LIMIT_REFILL_DURATION_SECONDS=60

REM ## JWT Parameters
REM This prototype has no Authentication service to issue tokens, so the
REM shared JWT filter is disabled by default (see application.properties).
set JWT_FILTER_ENABLED=false
set JWT_SECRET=CHANGE_ME_use_a_random_64_char_secret
set JWT_COOKIENAME=remex
set JWT_EXPIRATION_MS=86400000

REM ##Keystore Properties static properties
set KEYSTORE_PATH=classpath:keystore.p12
set TRUSTSTORE_PATH=classpath:truststore.jks
set KEYSTORE_PASSWORD=CHANGE_ME_strong_keystore_password
set KEYSTORE_TYPE=PKCS12

REM ## RemExService Parameters
set RMXRSMS_LOCAL_PORT=9014
set RMXRSMS_HOST=localhost
set RMXRSMS_ENABLE_HTTPS=false
set RMXRSMS_KEYSTORE_KEY_ALIAS=%RMX_KEYSTORE_KEY_ALIAS%

REM ## RMXStudio (Next.js Web Portal) Parameters
set RMXSTUDIO_LOCAL_PORT=3300
set RMXSTUDIO_HOST=%RMX_HOST%
set RMXSTUDIO_RMX_HOST=http://%RMX_HOST%

REM  Build all Microservices

REM Generate self-signed TLS certs for all microservices (idempotent).
call "%~dp0generate-certs.bat"

REM ============================================================================
REM  Stop any previously-deployed services and wipe stale build artefacts.
REM  Without this, a still-running java.exe holds target\<svc>.jar open, so
REM  `mvn clean` silently leaves the old fat jar in place and the next
REM  `start ... java -jar` keeps booting yesterday's code. Same story for
REM  RemEx's .next bundle — Next.js will happily serve a stale chunk
REM  if `npm run build` skips work because timestamps look unchanged.
REM ============================================================================
echo.
echo [BuildNLocalDeploy] Stopping any previously-deployed RMX services...
for %%T in (
    "RemExService"
    "RMX Studio"
) do (
    taskkill /FI "WINDOWTITLE eq %%~T" /T /F >nul 2>&1
)
REM Give the OS a moment to release file handles on the target jars.
ping -w 1000 -n 3 127.0.0.1 > nul

echo [BuildNLocalDeploy] Removing stale build artefacts...
for %%S in (
    Common-Lib
    RemExService
) do (
    if exist "%%S\target" rmdir /S /Q "%%S\target" >nul 2>&1
)
REM Next.js build cache — `npm run build` won't always invalidate hashed
REM bundle filenames, so wipe .next to force a clean compile and avoid
REM the browser sticking to an old client chunk hash.
if exist "RemEx\.next" rmdir /S /Q "RemEx\.next" >nul 2>&1
REM Give Windows / AV scanner a few seconds to release file handles on the
REM just-deleted target\ directories before mvn starts writing new .class
REM files. Without this, AV-scanner / indexer races cause sporadic
REM "error while writing ... .class (The system cannot find the path
REM specified)" failures during testCompile.
ping -w 1000 -n 6 127.0.0.1 > nul
echo [BuildNLocalDeploy] Clean complete.
echo.

REM ============================================================================

REM Common-Lib must be installed first so all dependent services pick up
REM the latest changes (rate limiting, CORS ordering fix, LogReaderService,
REM etc.). Abort the whole deploy if it fails.
pushd Common-Lib
call mvnw clean install -Dmaven.test.skip=true
if errorlevel 1 (
    popd
    echo.
    echo *** BUILD FAILED: Common-Lib - aborting deploy ***
    exit /b 1
)
popd

REM Build every Java service via fail-fast loop. If any module's `mvnw clean
REM package` returns a non-zero exit code, abort immediately so we don't
REM relaunch the stack with a stale or missing jar.
for %%M in (
    RemExService
) do (
    pushd %%M
    call mvnw clean package -Dmaven.test.skip=true
    if errorlevel 1 (
        popd
        echo.
        echo *** BUILD FAILED: %%M - aborting deploy ***
        exit /b 1
    )
    popd
)

REM ## RemEx (Next.js Web Portal) - Node 20+ required
REM NOTE: the two error-handling blocks below must NOT contain literal
REM parentheses inside the echo text (e.g. "(npm install)"). cmd.exe scans
REM for the matching close-paren of the enclosing `if ( ... )` block before
REM it even evaluates the condition, and it does this scan blindly across
REM echo text too. A "(word)" pair inside the echo can close the IF block
REM early, leaving any trailing text on that line (e.g. "- aborting deploy
REM ***") to be parsed as its own command - which is what produced the
REM "- was unexpected at this time." error. Keep these messages paren-free.
pushd RemEx
call npm install --no-audit --no-fund
if errorlevel 1 (
    popd
    echo.
    echo *** BUILD FAILED: RemEx npm install - aborting deploy ***
    exit /b 1
)
call npm run build
if errorlevel 1 (
    popd
    echo.
    echo *** BUILD FAILED: RemEx npm run build - aborting deploy ***
    exit /b 1
)
popd


REM Run all Microservices
ping -w 1000 -n 5 127.0.0.1 > nul
start "RemExService" /MIN java -DLOGGING_FILE_MAX_SIZE=100MB -DLOGGING_FILE_MAX_HISTORY=30 -DLOGGING_FILE_DIRECTORY=./logs -jar RemExService\target\RemExService.jar

ping -w 1000 -n 5 127.0.0.1 > nul

REM ## Run RemEx (Next.js standalone server on port %RMXSTUDIO_LOCAL_PORT%)
start "RMX Studio" /MIN cmd /c "cd RemEx && npm run start"
ping -w 1000 -n 5 127.0.0.1 > nul
