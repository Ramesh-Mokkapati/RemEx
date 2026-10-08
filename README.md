# RMX-NG - Remote Explorer (RemEx) Prototype

A prototype containing **RemExService** (Java/Spring Boot) and **Remote Explorer (RemEx)** — a Next.js portal for configuring and operating Windows-based servers remotely. There is no login/authentication requirement; authentication (JWT, IP whitelisting, etc.) is out of scope for this prototype.

**Windows only:** RemExService shells out to native Windows tooling via JNA (system info, processes, scheduled tasks, file management). There is no Linux build.

## Live demo (GitHub Pages)

- RemEx: https://ramesh-mokkapati.github.io/RemEx/

## Web Portal

> [**RemEx - Remote Explorer**](RemEx/README.md) — Next.js portal with a ribbon-menu UI surfacing the Remote Server Management REST endpoints. Runs on port **3300**.

## Microservice

> [**RemExService**](RemExService/README.md)

- System info, file/folder management, processes and remote commands
- Runs on port **9014**
- Depends on **Common-Lib** (shared filters/config, built as a Maven module alongside it)

## Common features

### Probe APIs

- **Root Controller**: `localhost:<port>/`
- **Probe Live**: `localhost:<port>/probe/live`
- **Probe Restart**: `localhost:<port>/probe/restart`
- **Probe Ready**: `localhost:<port>/probe/ready`
- **Actuator Health**: `localhost:<port>/actuator/health`
- **Actuator Liveness**: `localhost:<port>/actuator/health/liveness`
- **Actuator Readiness**: `localhost:<port>/actuator/health/readiness`

## Building & running locally

Prerequisites: Java 11, Node 20+, Maven wrapper (`mvnw.cmd`) in each module.

### Full local deploy

Builds Common-Lib, RemExService, and RemEx, then launches all services:

```
Scripts\BuildNLocalDeploy.bat
```

### Building only RemEx

```
cd RemEx
npm install
npm run build      # static export → out/
npx serve out      # serves on http://localhost:3000
```

Or for development with hot-reload:

```
cd RemEx
npm install
npm run dev        # http://localhost:3000
```

## HTTPS deployment

RemExService ships with HTTPS support; set `app.use-https=true` plus a PKCS12 keystore to switch from HTTP to TLS.

A self-signed dev keystore (`dev-keystore.p12`, alias `rmx-dev`, password `changeit`, CN=`rmx-dev`, SAN `localhost`/`127.0.0.1`) is provided at the repo root for local testing. **Do not use in production** — replace with a CA-signed certificate.

### Enable HTTPS (PowerShell)

```powershell
. .\enable-https.ps1
mvnw spring-boot:run
```

### Generating a production keystore

```powershell
keytool -genkeypair -alias rmx-prod -keyalg RSA -keysize 4096 `
  -validity 825 -storetype PKCS12 -keystore prod-keystore.p12 `
  -storepass <STRONG_PASSWORD> -keypass <STRONG_PASSWORD> `
  -dname "CN=rmx.example.com, O=RemExService, C=GB" `
  -ext "SAN=DNS:rmx.example.com"
```

Then set `KEYSTORE_PATH`, `KEYSTORE_PASSWORD`, and `RMXRSMS_KEYSTORE_KEY_ALIAS` to point at the new keystore and restart the service.

## Development notes

### Environment variables

When using IntelliJ, edit the run configuration for `RemExService` and add the path to the `.env` file at the repo root under **Environment Variables**. This provides runtime values for hosts, ports, etc.

## GitHub Pages deployment

The `pages.yml` workflow builds a static export of `RemEx` and deploys it to GitHub Pages on every push to `main`.

### GitHub Pages setup

1. Go to repository **Settings** → **Pages**
2. Under "Build and deployment", set **Source** to `GitHub Actions` and click **Save**

The workflow will automatically deploy on the next push to `main`.
