# RemEx — Remote Explorer

A Next.js web portal for the **RemExService**, built
around a **Microsoft-style Ribbon Menu** modeled on
[`@olton/ribbon-menu`](https://github.com/olton/ribbon-menu).

This is a trimmed-down prototype build: every other RMX-NG microservice has
been removed, and there is no login/authentication requirement — all
`/v1/*` requests go straight through the proxy.

The shipped npm package only contains documentation (no built component dist),
so the matching component API (`RibbonMenu`, `RibbonTab`, `RibbonButton`,
`RibbonToolButton`, `RibbonIconButton`, `RibbonButtonGroup`, `RibbonSplitButton`,
`RibbonDropdown`, `RibbonDropdownMenu`, `RibbonDropdownItem`,
`RibbonDropdownDivider`, `RibbonDropdownCheckItem`) is reimplemented locally
under `src/components/ribbon/`. Anywhere the upstream package documents a
JSX snippet, the same snippet works here.

## What's wired up

RemEx surfaces the Remote Server Management Service as ribbon buttons.
Buttons route to a generic *try-it* page that auto-generates forms for each
endpoint and calls them through `apiClient`.

| Tab | Pages |
| --- | --- |
| Home | Dashboard, Services (health overview) |
| Operations | Remote Actions, Create Config, Delete Config, Service Logs |

The full endpoint list (`@RequestMapping`/`@*Mapping` annotations) was
extracted from the RSM Spring controller and recorded in `src/lib/services.js`.
Adding/removing an endpoint there immediately reflects on the service page.

## Running

**Windows only:** RemExService shells out to native
Windows tooling via JNA, so both it and RemEx's Docker image target
Windows Server containers. There is no Linux build.

### Local (npm)

```bash
cd RemEx
npm install
cp .env.example .env.local       # adjust host/port if RSMS isn't on localhost
npm run dev                      # http://localhost:3300
```

`npm run build && npm start` for a production build (uses Next.js' production
server locally on port `3300`).

### Docker (Windows containers)

RemEx ships with a multi-stage `RemEx.Dockerfile` (Windows Server
Core + nanoserver base images, Next.js
[standalone output](https://nextjs.org/docs/app/api-reference/next-config-js/output#automatically-copying-traced-files))
and a `docker-compose.yml`. Make sure Docker Desktop is switched to
**Windows containers** mode first.

```powershell
cd RemEx
docker compose up --build       # builds image, runs at http://localhost:3300
```

The image runs the Next.js standalone server via a PowerShell entrypoint
(`docker/entrypoint.ps1`) and exposes port `3300`. It also includes a
`HEALTHCHECK`.

#### Pointing at the Remote Server Management Service (no rebuild)

API calls happen in the user's **browser**, so the service URL must be
reachable from the user's machine — not from the Docker network. The
default assumes RemExService is running on
`localhost:9014`.

Override the host/port without rebuilding by passing env vars at container
start. The entrypoint rewrites `/public/runtime-env.js` from any `RMX_*` env
present, and the app reads it before any other JS runs:

```powershell
# Point at a remote RSM instance
docker run -p 3300:3300 `
  -e RMX_HOST=https://rmxng.example.com remex:1.0

# Override just the RSM host
docker run -p 3300:3300 `
  -e RMX_HOST=http://localhost `
  -e RMX_RSMS_HOST=https://rsm.videalert.example.com remex:1.0
```

Recognised variables: `RMX_HOST` plus `RMX_RSMS_PORT` and `RMX_RSMS_HOST`.

#### CORS

RemExService must allow cross-origin calls from
`http://localhost:3300`. The service uses Spring's `@CrossOrigin` /
`WebMvcConfigurer`, so this is a one-line change.

### Health page

`/health` calls `/probe/live` and `/probe/ready` on the Remote Server
Management Service and reports its status pill + latency.

### Per-service "try-it" page

`/services/remote-server` shows every documented endpoint of the service.
Each row expands into:

- The fully-qualified URL preview (with current params interpolated)
- Editable query-parameter inputs
- A JSON body editor for `POST`/`PUT`/`PATCH`
- A **Send request** button + status pill + JSON response viewer

Filter by free-text or by HTTP method using the toolbar above the list.
