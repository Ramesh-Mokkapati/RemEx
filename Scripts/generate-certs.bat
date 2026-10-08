@echo off
REM ----------------------------------------------------------------------------
REM generate-certs.bat - Windows companion to generate-certs.sh
REM
REM Generates a self-signed PKCS12 keystore + JKS truststore once into
REM <repo>\certs and copies them into each RMX microservice's
REM src\main\resources so they are packaged into the resulting jar
REM (KEYSTORE_PATH=classpath:keystore.p12).
REM
REM Usage:  generate-certs.bat [--force]
REM
REM Tunable env vars (with defaults):
REM   RMX_KEYSTORE_KEY_ALIAS   alias inside keystore.p12       (rmx-self-signed)
REM   KEYSTORE_PASSWORD        keystore + truststore password  (changeit)
REM   RMX_CERT_VALIDITY_DAYS   certificate lifetime in days    (3650)
REM   RMX_CERT_DNAME           X.500 distinguished name
REM   RMX_CERT_SAN             Subject Alt Names
REM ----------------------------------------------------------------------------
setlocal EnableDelayedExpansion

set FORCE=0
if /I "%~1"=="--force" set FORCE=1
if /I "%~1"=="-f" set FORCE=1

REM Resolve repo root (this script lives in <repo>\Scripts).
pushd "%~dp0.." >nul
set REPO_ROOT=%CD%

if not defined RMX_KEYSTORE_KEY_ALIAS set RMX_KEYSTORE_KEY_ALIAS=rmx-self-signed
if not defined KEYSTORE_PASSWORD set KEYSTORE_PASSWORD=changeit
if not defined RMX_CERT_VALIDITY_DAYS set RMX_CERT_VALIDITY_DAYS=3650
if not defined RMX_CERT_DNAME set RMX_CERT_DNAME=CN=rmx-self-signed,OU=RMX,O=remex,L=Unknown,ST=Unknown,C=GB
if not defined RMX_CERT_SAN set RMX_CERT_SAN=DNS:localhost,DNS:rmxams,DNS:rmxems,DNS:rmxrms,DNS:rmxdms,DNS:rmxwms,DNS:rmxaems,DNS:rmxmms,DNS:rmxnms,DNS:rmxsms,DNS:rmxalms,DNS:rmxdsms,DNS:rmxlms,DNS:rmxasms,DNS:rmxrsms,DNS:rmxmevis,DNS:rmxdrms,DNS:rmxavcms,DNS:rmxemcms,DNS:rmxrtms,DNS:rmxwfms,DNS:rmxvgs,IP:127.0.0.1

where keytool >nul 2>&1
if errorlevel 1 (
    echo ERROR: keytool not found on PATH ^(install a JDK or set JAVA_HOME^).>&2
    popd >nul
    exit /b 1
)

set CERT_DIR=%REPO_ROOT%\certs
if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"
set MASTER_KEYSTORE=%CERT_DIR%\keystore.p12
set MASTER_TRUSTSTORE=%CERT_DIR%\truststore.jks
set MASTER_CERT=%CERT_DIR%\rmx-self-signed.crt

if "%FORCE%"=="0" if exist "%MASTER_KEYSTORE%" if exist "%MASTER_TRUSTSTORE%" (
    echo [certs] master keystore present at %CERT_DIR% ^(use --force to regenerate^)
    goto :distribute
)

echo [certs] generating master self-signed keystore in %CERT_DIR%
if exist "%MASTER_KEYSTORE%" del /q "%MASTER_KEYSTORE%"
if exist "%MASTER_TRUSTSTORE%" del /q "%MASTER_TRUSTSTORE%"
if exist "%MASTER_CERT%" del /q "%MASTER_CERT%"

call keytool -genkeypair ^
    -alias "%RMX_KEYSTORE_KEY_ALIAS%" ^
    -keyalg RSA ^
    -keysize 2048 ^
    -validity %RMX_CERT_VALIDITY_DAYS% ^
    -dname "%RMX_CERT_DNAME%" ^
    -ext "SAN=%RMX_CERT_SAN%" ^
    -keystore "%MASTER_KEYSTORE%" ^
    -storetype PKCS12 ^
    -storepass "%KEYSTORE_PASSWORD%" ^
    -keypass "%KEYSTORE_PASSWORD%"
if errorlevel 1 goto :fail

call keytool -exportcert ^
    -alias "%RMX_KEYSTORE_KEY_ALIAS%" ^
    -file "%MASTER_CERT%" ^
    -keystore "%MASTER_KEYSTORE%" ^
    -storetype PKCS12 ^
    -storepass "%KEYSTORE_PASSWORD%"
if errorlevel 1 goto :fail

call keytool -importcert ^
    -alias "%RMX_KEYSTORE_KEY_ALIAS%" ^
    -file "%MASTER_CERT%" ^
    -keystore "%MASTER_TRUSTSTORE%" ^
    -storetype JKS ^
    -storepass "%KEYSTORE_PASSWORD%" ^
    -noprompt
if errorlevel 1 goto :fail

:distribute
for %%S in (
    RemExService
) do (
    set RES=%REPO_ROOT%\%%S\src\main\resources
    if exist "!RES!" (
        if "%FORCE%"=="0" if exist "!RES!\keystore.p12" if exist "!RES!\truststore.jks" (
            echo [certs] keep existing keystore for %%S ^(use --force to overwrite^)
        ) else (
            copy /y "%MASTER_KEYSTORE%" "!RES!\keystore.p12" >nul
            copy /y "%MASTER_TRUSTSTORE%" "!RES!\truststore.jks" >nul
            echo [certs] wrote keystore + truststore for %%S
        )
    ) else (
        echo [certs] skip %%S ^(no src\main\resources^)
    )
)

echo [certs] done. alias=%RMX_KEYSTORE_KEY_ALIAS% validity=%RMX_CERT_VALIDITY_DAYS%d
popd >nul
endlocal
exit /b 0

:fail
echo [certs] keytool failed.>&2
popd >nul
endlocal
exit /b 1
