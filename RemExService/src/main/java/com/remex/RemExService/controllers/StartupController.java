package com.remex.RemExService.controllers;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.remex.common.helpers.RequestHelper;
import com.remex.common.models.EventLog;
import com.remex.common.service.MessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Manages Windows startup applications via the CurrentVersion\Run registry keys.
 *
 * Enable/disable state is tracked in the StartupApproved\Run key (first byte
 * 0x02 = enabled, 0x03 = disabled) — the same mechanism Task Manager uses.
 * Writing to Machine scope requires RemExService to be running elevated.
 */
@RestController
@RequestMapping("/v1/rmxrsms")
public class StartupController {

    private static final Logger logger = LoggerFactory.getLogger(StartupController.class);

    private static final Pattern SAFE_APP_NAME = Pattern.compile("^[\\w\\s\\-\\.()]{1,256}$");
    private static final Set<String> VALID_SCOPES = new HashSet<>(Arrays.asList("User", "Machine", "All"));

    @Autowired
    private HttpServletRequest request;

    @Autowired
    private MessageService messageService;

    // -----------------------------------------------------------------------
    // List startup applications
    // -----------------------------------------------------------------------

    @GetMapping(path = "/startupapps", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> listStartupApps(
            @RequestParam(required = false, defaultValue = "All") String Scope) {
        if (!VALID_SCOPES.contains(Scope)) {
            return ResponseEntity.badRequest().body("Scope must be User, Machine, or All.");
        }
        try {
            List<String> scopes = "All".equals(Scope)
                    ? Arrays.asList("User", "Machine")
                    : Collections.singletonList(Scope);

            List<Map<String, Object>> combined = new ArrayList<>();
            ObjectMapper mapper = new ObjectMapper();

            for (String scope : scopes) {
                String runKey = runRegistryPath(scope);
                String approvedKey = approvedRegistryPath(scope);
                String scopeLabel = scope;
                String script =
                    "$runPath = '" + runKey + "'; " +
                    "$approvedPath = '" + approvedKey + "'; " +
                    "$run = Get-ItemProperty -Path $runPath -ErrorAction SilentlyContinue; " +
                    "$approved = Get-ItemProperty -Path $approvedPath -ErrorAction SilentlyContinue; " +
                    "$result = @(); " +
                    "if ($run) { " +
                    "  $skip = @('PSPath','PSParentPath','PSChildName','PSProvider','PSDrive'); " +
                    "  $names = $run | Get-Member -MemberType NoteProperty | " +
                    "    Where-Object { $skip -notcontains $_.Name } | " +
                    "    Select-Object -ExpandProperty Name; " +
                    "  foreach ($n in $names) { " +
                    "    $cmd = $run.$n; " +
                    "    $enabled = $true; " +
                    "    if ($approved) { " +
                    "      $av = $approved.$n; " +
                    "      if ($av -ne $null) { $enabled = ($av[0] -eq 2) } " +
                    "    } " +
                    "    $result += [PSCustomObject]@{ name = $n; command = $cmd; enabled = $enabled; scope = '" + scopeLabel + "' } " +
                    "  } " +
                    "} " +
                    "if ($result.Count -eq 0) { Write-Output '[]' } else { $result | ConvertTo-Json -Compress }";

                String output = runPowerShell(script);
                if (output == null || output.trim().isEmpty()) continue;
                String trimmed = output.trim();
                if (trimmed.equals("[]")) continue;
                if (trimmed.startsWith("{")) trimmed = "[" + trimmed + "]";
                List<Map<String, Object>> list = mapper.readValue(trimmed,
                        new TypeReference<List<Map<String, Object>>>() {});
                combined.addAll(list);
            }

            audit("Listed " + Scope + " startup applications");
            return ResponseEntity.ok(combined);
        } catch (IOException e) {
            logger.error("Failed to list {} startup applications", Scope, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to list startup applications: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Add (or overwrite) a startup entry
    // -----------------------------------------------------------------------

    @PostMapping(path = "/startupapps", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> addStartupApp(
            @RequestParam String Name,
            @RequestParam String Command,
            @RequestParam(required = false, defaultValue = "User") String Scope) {

        if (!SAFE_APP_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest()
                    .body("Invalid entry name. Use letters, numbers, spaces, hyphens, dots, or parentheses.");
        }
        if (Command == null || Command.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("Command cannot be empty.");
        }
        if (!VALID_SCOPES.contains(Scope)) {
            return ResponseEntity.badRequest().body("Scope must be User or Machine.");
        }
        try {
            String runKey = runRegistryPath(Scope);
            runPowerShell("Set-ItemProperty -Path '" + runKey + "' -Name '" + psEscape(Name)
                    + "' -Value '" + psEscape(Command) + "'");
            audit("Added " + Scope + " startup application: " + Name);
            return ResponseEntity.ok("Added");
        } catch (IOException e) {
            logger.error("Failed to add {} startup application '{}'", Scope, Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to add startup application: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Remove a startup entry
    // -----------------------------------------------------------------------

    @DeleteMapping(path = "/startupapps", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> deleteStartupApp(
            @RequestParam String Name,
            @RequestParam(required = false, defaultValue = "User") String Scope) {

        if (!SAFE_APP_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest().body("Invalid entry name.");
        }
        if (!VALID_SCOPES.contains(Scope)) {
            return ResponseEntity.badRequest().body("Scope must be User or Machine.");
        }
        try {
            String runKey = runRegistryPath(Scope);
            String approvedKey = approvedRegistryPath(Scope);
            String script =
                "Remove-ItemProperty -Path '" + runKey + "' -Name '" + psEscape(Name) + "' -ErrorAction Stop; " +
                "Remove-ItemProperty -Path '" + approvedKey + "' -Name '" + psEscape(Name) + "' -ErrorAction SilentlyContinue";
            runPowerShell(script);
            audit("Deleted " + Scope + " startup application: " + Name);
            return ResponseEntity.ok("Deleted");
        } catch (IOException e) {
            logger.error("Failed to delete {} startup application '{}'", Scope, Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to delete startup application: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Enable or disable a startup entry
    // -----------------------------------------------------------------------

    @PutMapping(path = "/startupapps", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> setStartupAppEnabled(
            @RequestParam String Name,
            @RequestParam boolean Enabled,
            @RequestParam(required = false, defaultValue = "User") String Scope) {

        if (!SAFE_APP_NAME.matcher(Name).matches()) {
            return ResponseEntity.badRequest().body("Invalid entry name.");
        }
        if (!VALID_SCOPES.contains(Scope)) {
            return ResponseEntity.badRequest().body("Scope must be User or Machine.");
        }
        try {
            String approvedKey = approvedRegistryPath(Scope);
            // 0x02 = enabled, 0x03 = disabled (Task Manager convention)
            String firstByte = Enabled ? "0x02" : "0x03";
            String script =
                "$path = '" + approvedKey + "'; " +
                "$name = '" + psEscape(Name) + "'; " +
                "if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }; " +
                "$existing = (Get-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue).$name; " +
                "if ($existing -ne $null -and $existing.Count -ge 4) { $bytes = $existing } " +
                "else { $bytes = New-Object byte[] 12 }; " +
                "$bytes[0] = " + firstByte + "; " +
                "Set-ItemProperty -Path $path -Name $name -Value $bytes -Type Binary";
            runPowerShell(script);
            audit((Enabled ? "Enabled" : "Disabled") + " " + Scope + " startup application: " + Name);
            return ResponseEntity.ok(Enabled ? "Enabled" : "Disabled");
        } catch (IOException e) {
            logger.error("Failed to {} {} startup application '{}'",
                    Enabled ? "enable" : "disable", Scope, Name, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to " + (Enabled ? "enable" : "disable") + " startup application: " + e.getMessage());
        }
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static String runRegistryPath(String scope) {
        return "User".equals(scope)
                ? "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
                : "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run";
    }

    private static String approvedRegistryPath(String scope) {
        return "User".equals(scope)
                ? "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run"
                : "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run";
    }

    private static String psEscape(String s) {
        return s == null ? "" : s.replace("'", "''");
    }

    private String runPowerShell(String command) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(
                "powershell.exe", "-NoProfile", "-NonInteractive",
                "-ExecutionPolicy", "Bypass",
                "-Command", command);
        pb.redirectErrorStream(false);
        Process process = pb.start();

        String stdout;
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream()))) {
            stdout = reader.lines().collect(Collectors.joining("\n"));
        }

        try (BufferedReader errReader = new BufferedReader(
                new InputStreamReader(process.getErrorStream()))) {
            String stderr = errReader.lines().collect(Collectors.joining("\n"));
            if (!stderr.trim().isEmpty()) {
                logger.warn("PowerShell stderr: {}", stderr);
                throw new IOException(stderr.trim());
            }
        }

        return stdout;
    }

    private void audit(String action) {
        try {
            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(
                    request.getRemoteHost(), rh.getJWT_Token(), rh.GetUserNameFromJWT(),
                    action + " from " + request.getLocalName()));
        } catch (Exception e) {
            logger.warn("Audit event failed: {}", e.getMessage());
        }
    }
}
