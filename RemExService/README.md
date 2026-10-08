# RemExService

Remote Server Execution Service — a Spring Boot / Jetty microservice that exposes a REST API for managing Windows servers remotely. It runs natively on Windows (shells out to PowerShell and the Windows Task Scheduler via JNA) and is consumed by the **RemEx** web portal.

- **Default HTTP port:** `9014` (override via `RMXRSMS_LOCAL_PORT`)
- **Management port:** `8081` (Spring Actuator — health, info, restart)
- **Base path:** `/v1/rmxrsms`
- **JWT filter:** disabled by default (set `JWT_FILTER_ENABLED=true` to enable)

---

## Quick Start

```bat
Scripts\BuildNLocalDeploy.bat
```

This builds Common-Lib, RemExService, and the RemEx Next.js portal, then launches both services locally.

To start the service on its own (after building):

```bat
Scripts\RunRemoteServer.bat
```

---

## Configuration

All tuneable values are set via environment variables. The defaults in `application.properties` cover local development.

| Environment Variable | Default | Description |
| --- | --- | --- |
| `RMXRSMS_LOCAL_PORT` | `9014` | HTTP listen port |
| `RMXRSMS_ENABLE_HTTPS` | `false` | Enable TLS (requires keystore env vars below) |
| `JWT_FILTER_ENABLED` | `false` | Validate JWT bearer tokens on every request |
| `JWT_SECRET` | — | HMAC signing secret (required when JWT enabled) |
| `KEYSTORE_PATH` | `classpath:keystore.p12` | Path to PKCS12 keystore |
| `TRUSTSTORE_PATH` | `classpath:truststore.jks` | Path to JKS truststore |
| `KEYSTORE_PASSWORD` | — | Keystore + truststore password |
| `RATE_LIMIT_ENABLED` | `true` | Enable per-IP token-bucket rate limiting |
| `RATE_LIMIT_CAPACITY` | `200` | Token bucket capacity |
| `RATE_LIMIT_REFILL_TOKENS` | `200` | Tokens refilled per interval |
| `RATE_LIMIT_REFILL_DURATION_SECONDS` | `60` | Refill interval in seconds |
| `IP_WHITELIST` | *(all allowed)* | Comma-separated IPs/CIDR ranges to allow |
| `LOGGING_FILE_DIRECTORY` | `./` | Root directory for log files |

Generate self-signed TLS certificates (required if HTTPS is enabled):

```bat
Scripts\generate-certs.bat
```

---

## API Reference

All endpoints are under `http://localhost:9014` unless noted.

### System Information

| Endpoint | Method | Path | Description |
| --- | --- | --- | --- |
| **systeminfo** | GET | `/v1/rmxrsms/systeminfo` | Win32_ComputerSystem details |
| **biosinfo** | GET | `/v1/rmxrsms/biosinfo` | BIOS information |
| **cpuinfo** | GET | `/v1/rmxrsms/cpuinfo` | CPU details |
| **raminfo** | GET | `/v1/rmxrsms/raminfo` | Physical memory information |
| **diskinfo** | GET | `/v1/rmxrsms/diskinfo` | Disk volumes |
| **osinfo** | GET | `/v1/rmxrsms/osinfo` | Operating system caption |
| **installedapps** | GET | `/v1/rmxrsms/installedapps` | List installed applications (name, version, publisher) |

### File & Folder Management

| Endpoint | Method | Path | Parameters | Description |
| --- | --- | --- | --- | --- |
| **listdirectory** | GET | `/v1/rmxrsms/listdirectory` | `Folder` (optional) | List directory contents; omit `Folder` to list all drives |
| **allfiles** | GET | `/v1/rmxrsms/allfiles` | `Folder` | Recursively list all file paths under a folder |
| **filecontents** | GET | `/v1/rmxrsms/filecontents` | `Folder`, `File` | Read file contents as text |
| **downloadfile** | GET | `/v1/rmxrsms/downloadfile` | `File` | Download a file as a binary attachment |
| **uploadfile** | POST | `/v1/rmxrsms/uploadfile` | `Folder` (query), `file` (multipart) | Upload a file to a folder (binary-safe, 500 MB limit) |
| **renamefile** | POST | `/v1/rmxrsms/renamefile` | `Source`, `Target` | Rename or move a file |
| **deletefile** | DELETE | `/v1/rmxrsms/deletefile` | `Source` | Delete a file |
| **createfolder** | POST | `/v1/rmxrsms/createfolder` | `SourceFolder` | Create a new folder |
| **renamefolder** | POST | `/v1/rmxrsms/renamefolder` | `SourceFolder`, `TargetFolder` | Rename a folder |
| **deletefolder** | DELETE | `/v1/rmxrsms/deletefolder` | `Folder` | Delete a folder and its contents |

### Command Execution

| Endpoint | Method | Path | Parameters | Description |
| --- | --- | --- | --- | --- |
| **executecommand** | POST | `/v1/rmxrsms/executecommand` | `Command` | Execute a command on the server and return stdout |

### Windows Services

| Endpoint | Method | Path | Parameters | Description |
| --- | --- | --- | --- | --- |
| **services** | GET | `/v1/rmxrsms/services` | — | List all Windows services (name, display name, status) |
| **service/stop** | POST | `/v1/rmxrsms/service/stop` | `Name` | Stop a Windows service |
| **service/start** | POST | `/v1/rmxrsms/service/start` | `Name` | Start a Windows service |
| **service/restart** | POST | `/v1/rmxrsms/service/restart` | `Name` | Restart a Windows service |

### Windows Task Scheduler

| Endpoint | Method | Path | Parameters | Description |
| --- | --- | --- | --- | --- |
| **listtasks** | GET | `/v1/rmxrsms/listtasks` | — | List all scheduled tasks |
| **gettask** | GET | `/v1/rmxrsms/gettask` | `TaskPath` | Get full task details (actions, triggers, conditions, settings) |
| **exporttask** | GET | `/v1/rmxrsms/exporttask` | `TaskPath` | Export task definition as XML attachment |
| **listtaskfolders** | GET | `/v1/rmxrsms/listtaskfolders` | — | List task scheduler folders |
| **createtask** | POST | `/v1/rmxrsms/createtask` | JSON body | Create a scheduled task |
| **modifytask** | PUT | `/v1/rmxrsms/modifytask` | JSON body | Modify an existing scheduled task |
| **enabletask** | PUT | `/v1/rmxrsms/enabletask` | `TaskName`, `Folder` | Enable a scheduled task |
| **disabletask** | PUT | `/v1/rmxrsms/disabletask` | `TaskName`, `Folder` | Disable a scheduled task |
| **deletetask** | DELETE | `/v1/rmxrsms/deletetask` | `TaskName`, `Folder` | Delete a scheduled task |
| **createtaskfolder** | POST | `/v1/rmxrsms/createtaskfolder` | `Folder` | Create a task scheduler folder |
| **renametaskfolder** | PUT | `/v1/rmxrsms/renametaskfolder` | `Folder`, `NewFolder` | Rename a task scheduler folder |
| **deletetaskfolder** | DELETE | `/v1/rmxrsms/deletetaskfolder` | `Folder` | Delete a task scheduler folder |

`createtask` / `modifytask` JSON body:

```json
{
  "TaskName": "MyTask",
  "Folder": "\\MyFolder",
  "Command": "C:\\RMX\\rmxutil.exe",
  "Arguments": "--run",
  "WorkingDirectory": "C:\\RMX",
  "ScheduleType": "ONCE",
  "StartDate": "2025-01-01",
  "StartTime": "08:00",
  "RunAsUser": "SYSTEM",
  "RunAsPassword": ""
}
```

### Environment Variables

| Endpoint | Method | Path | Parameters | Description |
| --- | --- | --- | --- | --- |
| **envvars** | GET | `/v1/rmxrsms/envvars` | `Scope` (`Process`\|`User`\|`Machine`) | List environment variables for the given scope |
| **envvars** | POST | `/v1/rmxrsms/envvars` | `Name`, `Value`, `Scope` (`User`\|`Machine`) | Create or update an environment variable |
| **envvars** | DELETE | `/v1/rmxrsms/envvars` | `Name`, `Scope` (`User`\|`Machine`) | Delete an environment variable |

> Writing to `Machine` scope requires the service to run as Administrator.

### Probes & Operational

| Endpoint | Method | Path | Description |
| --- | --- | --- | --- |
| **live** | GET | `/probe/live` | Liveness probe — 200 when the process is running |
| **ready** | GET | `/probe/ready` | Readiness probe — 200 when ready to serve |
| **restart** | POST | `/probe/restart` | Trigger a graceful restart via Spring Actuator |
| **logs** | GET | `/logs` | Read recent application log lines |
| **root** | GET | `/` | Returns service name, version, and Java version |

Spring Actuator endpoints are served on port `8081`: `/actuator/health`, `/actuator/info`, `/actuator/restart`.

---

## Security

- **Rate limiting** — per-IP token bucket (Bucket4j + Caffeine). Configurable via `RATE_LIMIT_*` env vars.
- **IP whitelist** — optional CIDR-based allowlist via `IP_WHITELIST`.
- **JWT validation** — disabled by default. Enable with `JWT_FILTER_ENABLED=true`.
- **Security headers** — HSTS, X-Frame-Options, X-Content-Type-Options, Cache-Control on every response.
- **Path traversal protection** — all file/folder operations canonicalise paths before use.
- **Service name validation** — Windows service names are validated against a safe-character pattern before being passed to PowerShell.

---

## Building

```bat
REM Build Common-Lib first (RemExService depends on it)
cd Common-Lib
mvnw clean install -Dmaven.test.skip=true
cd ..

REM Build RemExService
cd RemExService
mvnw clean package -Dmaven.test.skip=true
```

The fat JAR is written to `RemExService/target/RemExService.jar`.

---