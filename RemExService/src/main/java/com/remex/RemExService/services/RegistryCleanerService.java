package com.remex.RemExService.services;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.remex.RemExService.websocket.ScanProgressWebSocketHandler;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@Service
public class RegistryCleanerService {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private ScanProgressWebSocketHandler wsHandler;

    // -------------------------------------------------------------------------
    // Async job tracking
    // -------------------------------------------------------------------------

    public static class ScanJob {
        public final String jobId;
        public volatile String status = "running";
        public volatile List<Map<String, Object>> results;
        public volatile String error;

        public ScanJob(String jobId) { this.jobId = jobId; }
    }

    private final ConcurrentHashMap<String, ScanJob> jobs = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    public ScanJob startScanAsync(final List<String> categories) {
        final String jobId = UUID.randomUUID().toString();
        final ScanJob job = new ScanJob(jobId);
        jobs.put(jobId, job);
        executor.submit(new Runnable() {
            public void run() {
                try {
                    List<Map<String, Object>> all = new ArrayList<>();
                    for (int i = 0; i < categories.size(); i++) {
                        String cat = categories.get(i);
                        wsHandler.sendProgress(jobId, cat, i + 1, categories.size());
                        String script = buildSingleCategoryScript(cat);
                        File f = writeTempScript(script);
                        try {
                            List<Map<String, Object>> catResults = parseOutput(runPs(f));
                            all.addAll(catResults);
                        } catch (Exception e) {
                            /* continue with next category */
                        } finally {
                            f.delete();
                        }
                    }
                    job.results = all;
                    job.status = "complete";
                    wsHandler.sendComplete(jobId, all.size());
                } catch (Exception e) {
                    job.error = e.getMessage();
                    job.status = "error";
                    wsHandler.sendError(jobId, e.getMessage());
                }
                executor.submit(new Runnable() {
                    public void run() {
                        try { Thread.sleep(600000); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
                        jobs.remove(jobId);
                        wsHandler.cleanupJob(jobId);
                    }
                });
            }
        });
        return job;
    }

    public ScanJob getScanJob(String jobId) {
        return jobs.get(jobId);
    }

    // -------------------------------------------------------------------------

    public static final String[] ALL_CATEGORIES = {
        "Application Paths", "Browser Helper", "Firewall Rules", "Fonts",
        "Help Files", "Installers", "Interface", "Invalid File Extensions",
        "Missing Shared DLLs", "MUI Cache", "Obsolete Software",
        "Open with Application", "Run At Startup", "Sound Events", "Windows Services"
    };

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    public List<Map<String, Object>> scan(List<String> categories) throws Exception {
        String script = buildScanScript(categories);
        File f = writeTempScript(script);
        try {
            return parseOutput(runPs(f));
        } finally {
            f.delete();
        }
    }

    public void fix(List<Map<String, Object>> issues) throws Exception {
        if (issues == null || issues.isEmpty()) return;
        StringBuilder sb = new StringBuilder();
        sb.append("$ErrorActionPreference = 'SilentlyContinue'\n");
        for (Map<String, Object> issue : issues) {
            String kp = String.valueOf(issue.getOrDefault("keyPath", ""));
            String vn = String.valueOf(issue.getOrDefault("valueName", ""));
            String ft = String.valueOf(issue.getOrDefault("fixType", "DeleteValue"));
            if (kp.trim().isEmpty()) continue;
            String psKp = "Registry::" + kp;
            String escapedKp = psKp.replace("'", "''");
            if ("DeleteKey".equals(ft)) {
                sb.append("Remove-Item -LiteralPath '").append(escapedKp).append("' -Recurse -Force\n");
            } else {
                if ("(default)".equalsIgnoreCase(vn) || vn.trim().isEmpty()) {
                    sb.append("Remove-ItemProperty -LiteralPath '").append(escapedKp)
                      .append("' -Name '(default)' -Force\n");
                } else {
                    sb.append("Remove-ItemProperty -LiteralPath '").append(escapedKp)
                      .append("' -Name '").append(vn.replace("'", "''")).append("' -Force\n");
                }
            }
        }
        File f = writeTempScript(sb.toString());
        try { runPs(f); } finally { f.delete(); }
    }

    public byte[] backup(List<String> keyPaths) throws Exception {
        if (keyPaths == null || keyPaths.isEmpty()) return new byte[0];
        Set<String> unique = new LinkedHashSet<>();
        for (String kp : keyPaths) {
            if (kp != null && !kp.trim().isEmpty()) unique.add(kp.trim());
        }
        String outPath = System.getProperty("java.io.tmpdir").replace('\\', '/')
                + "/rmx_regbak_" + System.currentTimeMillis() + ".reg";
        StringBuilder sb = new StringBuilder();
        sb.append("$combined = \"Windows Registry Editor Version 5.00`r`n`r`n\"\n");
        for (String kp : unique) {
            sb.append("$tmp = [System.IO.Path]::GetTempFileName() + '.reg'\n");
            sb.append("& reg.exe export '").append(kp.replace("'", "''")).append("' $tmp /y 2>$null | Out-Null\n");
            sb.append("if (Test-Path $tmp) {\n");
            sb.append("  $c = Get-Content $tmp -Raw -Encoding Unicode\n");
            sb.append("  $c = $c -replace 'Windows Registry Editor Version 5\\.00[\\r\\n]+', ''\n");
            sb.append("  $combined += $c + \"`r`n\"\n");
            sb.append("  Remove-Item $tmp -Force\n");
            sb.append("}\n");
        }
        sb.append("[System.IO.File]::WriteAllText('").append(outPath.replace("'", "''"))
          .append("', $combined, [System.Text.Encoding]::Unicode)\n");
        File scriptFile = writeTempScript(sb.toString());
        try { runPs(scriptFile); } finally { scriptFile.delete(); }
        File outFile = new File(outPath);
        try {
            if (!outFile.exists()) return new byte[0];
            return readFileBytes(outFile);
        } finally {
            outFile.delete();
        }
    }

    // -------------------------------------------------------------------------
    // Script building
    // -------------------------------------------------------------------------

    private String buildScriptHeader() {
        StringBuilder sb = new StringBuilder();
        sb.append("$OutputEncoding = [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false\n");
        sb.append("$issues = [System.Collections.ArrayList]@()\n");
        sb.append("$winDir = $env:SystemRoot\n");
        sb.append("$skip = @('PSPath','PSParentPath','PSChildName','PSProvider','PSDrive')\n\n");
        sb.append("function Add-Issue($c,$n,$k,$v,$val,$f,$i) {\n");
        sb.append("  $null = $issues.Add([ordered]@{\n");
        sb.append("    category=$c; name=$n; keyPath=$k; valueName=$v\n");
        sb.append("    value=[string]$val; fixType=$f; issue=$i\n");
        sb.append("  })\n}\n\n");
        sb.append("function Get-CmdPath($cmd) {\n");
        sb.append("  if (-not $cmd) { return $null }\n");
        sb.append("  $cmd = [Environment]::ExpandEnvironmentVariables($cmd.Trim())\n");
        sb.append("  if ($cmd -match '^\"([^\"]+)\"') { return $Matches[1] }\n");
        sb.append("  if ($cmd -match '^([^,; ]+\\.(?:exe|sys|dll))') { return $Matches[1] }\n");
        sb.append("  return $null\n}\n\n");
        sb.append("$sysDir = [System.IO.Path]::Combine($winDir, 'System32')\n");
        sb.append("$syswow = [System.IO.Path]::Combine($winDir, 'SysWOW64')\n");
        sb.append("function Test-DllPath($dll) {\n");
        sb.append("  if (-not $dll) { return $true }\n");
        sb.append("  if ([System.IO.Path]::IsPathRooted($dll)) { return (Test-Path $dll -EA SilentlyContinue) }\n");
        sb.append("  return ((Test-Path ([System.IO.Path]::Combine($sysDir, $dll)) -EA SilentlyContinue) -or\n");
        sb.append("          (Test-Path ([System.IO.Path]::Combine($syswow, $dll)) -EA SilentlyContinue) -or\n");
        sb.append("          (Test-Path ([System.IO.Path]::Combine($winDir, $dll)) -EA SilentlyContinue))\n");
        sb.append("}\n\n");
        return sb.toString();
    }

    private void appendCategoryBody(StringBuilder sb, String cat) {
        switch (cat) {
            case "Application Paths":       sb.append(scriptApplicationPaths()); break;
            case "Browser Helper":          sb.append(scriptBrowserHelper()); break;
            case "Firewall Rules":          sb.append(scriptFirewallRules()); break;
            case "Fonts":                   sb.append(scriptFonts()); break;
            case "Help Files":              sb.append(scriptHelpFiles()); break;
            case "Installers":              sb.append(scriptInstallers()); break;
            case "Interface":               sb.append(scriptInterface()); break;
            case "Invalid File Extensions": sb.append(scriptInvalidFileExtensions()); break;
            case "Missing Shared DLLs":     sb.append(scriptMissingSharedDlls()); break;
            case "MUI Cache":               sb.append(scriptMuiCache()); break;
            case "Obsolete Software":       sb.append(scriptObsoleteSoftware()); break;
            case "Open with Application":   sb.append(scriptOpenWithApplication()); break;
            case "Run At Startup":          sb.append(scriptRunAtStartup()); break;
            case "Sound Events":            sb.append(scriptSoundEvents()); break;
            case "Windows Services":        sb.append(scriptWindowsServices()); break;
            default: break;
        }
    }

    private String buildScanScript(List<String> categories) {
        StringBuilder sb = new StringBuilder(buildScriptHeader());
        for (String cat : categories) {
            sb.append("# ").append(cat).append("\ntry {\n");
            appendCategoryBody(sb, cat);
            sb.append("} catch {}\n\n");
        }
        sb.append("if ($issues.Count -eq 0) { Write-Output '[]' }\n");
        sb.append("else { $issues | ConvertTo-Json -Compress -Depth 2 }\n");
        return sb.toString();
    }

    private String buildSingleCategoryScript(String cat) {
        StringBuilder sb = new StringBuilder(buildScriptHeader());
        sb.append("# ").append(cat).append("\ntry {\n");
        appendCategoryBody(sb, cat);
        sb.append("} catch {}\n\n");
        sb.append("if ($issues.Count -eq 0) { Write-Output '[]' }\n");
        sb.append("else { $issues | ConvertTo-Json -Compress -Depth 2 }\n");
        return sb.toString();
    }

    private List<Map<String, Object>> parseOutput(String output) throws Exception {
        if (output == null) return Collections.emptyList();
        String t = output.trim();
        if (t.isEmpty() || t.equals("null") || t.equals("[]")) return Collections.emptyList();
        if (t.startsWith("{")) t = "[" + t + "]";
        return MAPPER.readValue(t, new TypeReference<List<Map<String, Object>>>() {});
    }

    // -------------------------------------------------------------------------
    // Category scripts
    // -------------------------------------------------------------------------

    private String scriptMissingSharedDlls() {
        return
            "  $kp = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\SharedDLLs'\n" +
            "  $p = Get-ItemProperty ('Registry::' + $kp) -EA SilentlyContinue\n" +
            "  if ($p) {\n" +
            "    $p.PSObject.Properties | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {\n" +
            "      $f = [Environment]::ExpandEnvironmentVariables($_.Name)\n" +
            "      if (-not (Test-Path $f -EA SilentlyContinue)) {\n" +
            "        Add-Issue 'Missing Shared DLLs' $_.Name $kp $_.Name $_.Value 'DeleteValue' 'File not found'\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptApplicationPaths() {
        return
            "  $appPathBases = @(\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'; kpBase='HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths' },\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths'; kpBase='HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths' },\n" +
            "    @{ ps='HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'; kpBase='HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths' }\n" +
            "  )\n" +
            "  $seenAppPaths = @{}\n" +
            "  foreach ($baseObj in $appPathBases) {\n" +
            "    foreach ($key in (Get-ChildItem $baseObj.ps -EA SilentlyContinue)) {\n" +
            "      $def = (Get-ItemProperty $key.PSPath -EA SilentlyContinue).'(default)'\n" +
            "      if ($def -and $def.Trim() -ne '') {\n" +
            "        $f = [Environment]::ExpandEnvironmentVariables($def.Trim().Trim('\"').Split(',')[0].Trim())\n" +
            "        $dedupKey = $f.ToLower()\n" +
            "        if ($f -and -not $seenAppPaths[$dedupKey] -and -not (Test-Path $f -EA SilentlyContinue)) {\n" +
            "          $seenAppPaths[$dedupKey] = $true\n" +
            "          $kp = $baseObj.kpBase + '\\' + $key.PSChildName\n" +
            "          Add-Issue 'Application Paths' $key.PSChildName $kp '(default)' $def 'DeleteKey' ('File not found: ' + $f)\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptFonts() {
        return
            "  $kp = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts'\n" +
            "  $fontsDir = [System.IO.Path]::Combine($winDir, 'Fonts')\n" +
            "  $p = Get-ItemProperty ('Registry::' + $kp) -EA SilentlyContinue\n" +
            "  if ($p) {\n" +
            "    $p.PSObject.Properties | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {\n" +
            "      $val = [string]$_.Value\n" +
            "      if ($val) {\n" +
            "        $f = if ([System.IO.Path]::IsPathRooted($val)) { $val } else { [System.IO.Path]::Combine($fontsDir, $val) }\n" +
            "        if (-not (Test-Path $f -EA SilentlyContinue)) {\n" +
            "          Add-Issue 'Fonts' $_.Name $kp $_.Name $val 'DeleteValue' 'Font file not found'\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptRunAtStartup() {
        return
            "  $entries = @(\n" +
            "    @{ kp='HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; ps='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'; scope='User' },\n" +
            "    @{ kp='HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'; ps='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run'; scope='Machine' }\n" +
            "  )\n" +
            "  foreach ($e in $entries) {\n" +
            "    $p = Get-ItemProperty $e.ps -EA SilentlyContinue\n" +
            "    if ($p) {\n" +
            "      $p.PSObject.Properties | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {\n" +
            "        $f = Get-CmdPath ([string]$_.Value)\n" +
            "        if ($f -and -not (Test-Path $f -EA SilentlyContinue)) {\n" +
            "          Add-Issue 'Run At Startup' ($_.Name + ' (' + $e.scope + ')') $e.kp $_.Name $_.Value 'DeleteValue' ('File not found: ' + $f)\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptMuiCache() {
        return
            "  $kp = 'HKEY_CURRENT_USER\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache'\n" +
            "  $p = Get-ItemProperty ('Registry::' + $kp) -EA SilentlyContinue\n" +
            "  if ($p) {\n" +
            "    $p.PSObject.Properties | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {\n" +
            "      if ($_.Name -match '^([A-Za-z]:\\\\.*)\\.([^.\\\\]+)$') {\n" +
            "        $filePath = $Matches[1]\n" +
            "        if (-not (Test-Path $filePath -EA SilentlyContinue)) {\n" +
            "          Add-Issue 'MUI Cache' $_.Name $kp $_.Name $_.Value 'DeleteValue' 'File not found'\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptWindowsServices() {
        return
            "  $kpBase = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services'\n" +
            "  foreach ($key in (Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services' -EA SilentlyContinue)) {\n" +
            "    $p = Get-ItemProperty $key.PSPath -EA SilentlyContinue\n" +
            "    $svcType = try { [int]$p.Type } catch { -1 }\n" +
            "    if ($svcType -ne 16 -and $svcType -ne 32) { continue }\n" +
            "    $imageP = [string]$p.ImagePath\n" +
            "    if (-not $imageP) { continue }\n" +
            "    $expanded = [Environment]::ExpandEnvironmentVariables($imageP -replace '\\\\SystemRoot', $winDir)\n" +
            "    $exe = Get-CmdPath $expanded\n" +
            "    if ($exe -and -not (Test-Path $exe -EA SilentlyContinue)) {\n" +
            "      $kp = $kpBase + '\\' + $key.PSChildName\n" +
            "      Add-Issue 'Windows Services' $key.PSChildName $kp 'ImagePath' $imageP 'DeleteKey' ('Image not found: ' + $exe)\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptHelpFiles() {
        return
            "  $kp = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\Help'\n" +
            "  $p = Get-ItemProperty ('Registry::' + $kp) -EA SilentlyContinue\n" +
            "  if ($p) {\n" +
            "    $p.PSObject.Properties | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {\n" +
            "      $val = [Environment]::ExpandEnvironmentVariables([string]$_.Value)\n" +
            "      if ($val -and $val.Trim() -ne '') {\n" +
            "        $f = if ([System.IO.Path]::IsPathRooted($val)) { $val } else { [System.IO.Path]::Combine($winDir, 'Help', $val) }\n" +
            "        if (-not (Test-Path $f -EA SilentlyContinue)) {\n" +
            "          Add-Issue 'Help Files' $_.Name $kp $_.Name $_.Value 'DeleteValue' 'Help file not found'\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptFirewallRules() {
        return
            "  $kp = 'HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy\\FirewallRules'\n" +
            "  $p = Get-ItemProperty ('Registry::' + $kp) -EA SilentlyContinue\n" +
            "  if ($p) {\n" +
            "    $p.PSObject.Properties | Where-Object { $skip -notcontains $_.Name } | ForEach-Object {\n" +
            "      $ruleStr = [string]$_.Value\n" +
            "      if ($ruleStr -match '(?:^|\\|)App=([^|]+)') {\n" +
            "        $app = [Environment]::ExpandEnvironmentVariables($Matches[1].Trim())\n" +
            "        if ($app -ne 'System' -and $app -notmatch 'svchost' -and -not (Test-Path $app -EA SilentlyContinue)) {\n" +
            "          Add-Issue 'Firewall Rules' $_.Name $kp $_.Name $_.Value 'DeleteValue' ('App not found: ' + $app)\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptBrowserHelper() {
        return
            "  $bhoBase = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Browser Helper Objects'\n" +
            "  $kpBase = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Browser Helper Objects'\n" +
            "  foreach ($key in (Get-ChildItem $bhoBase -EA SilentlyContinue)) {\n" +
            "    $clsid = $key.PSChildName\n" +
            "    $inprocP = \"HKLM:\\SOFTWARE\\Classes\\CLSID\\$clsid\\InprocServer32\"\n" +
            "    $dll = (Get-ItemProperty $inprocP -EA SilentlyContinue).'(default)'\n" +
            "    $kp = $kpBase + '\\' + $clsid\n" +
            "    if ($dll) {\n" +
            "      $dll = [Environment]::ExpandEnvironmentVariables($dll.Trim('\"'))\n" +
            "      if (-not (Test-DllPath $dll)) {\n" +
            "        Add-Issue 'Browser Helper' $clsid $kp '' $dll 'DeleteKey' ('DLL not found: ' + $dll)\n" +
            "      }\n" +
            "    } else {\n" +
            "      Add-Issue 'Browser Helper' $clsid $kp '' '' 'DeleteKey' 'CLSID has no InprocServer32 entry'\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptInterface() {
        return
            "  $ifaceBases = @(\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\Classes\\Interface'; kpBase='HKEY_LOCAL_MACHINE\\SOFTWARE\\Classes\\Interface' },\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\WOW6432Node\\Classes\\Interface'; kpBase='HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Classes\\Interface' }\n" +
            "  )\n" +
            "  foreach ($baseObj in $ifaceBases) {\n" +
            "    if (-not (Test-Path $baseObj.ps -EA SilentlyContinue)) { continue }\n" +
            "    foreach ($key in (Get-ChildItem $baseObj.ps -EA SilentlyContinue)) {\n" +
            "      $clsid = $key.PSChildName\n" +
            "      $psClsid = (Get-ItemProperty (Join-Path $key.PSPath 'ProxyStubClsid32') -EA SilentlyContinue).'(default)'\n" +
            "      if ($psClsid) {\n" +
            "        $dll = (Get-ItemProperty \"HKLM:\\SOFTWARE\\Classes\\CLSID\\$psClsid\\InprocServer32\" -EA SilentlyContinue).'(default)'\n" +
            "        if (-not $dll) {\n" +
            "          $dll = (Get-ItemProperty \"HKLM:\\SOFTWARE\\WOW6432Node\\Classes\\CLSID\\$psClsid\\InprocServer32\" -EA SilentlyContinue).'(default)'\n" +
            "        }\n" +
            "        if ($dll) {\n" +
            "          $dll = [Environment]::ExpandEnvironmentVariables($dll.Trim('\"'))\n" +
            "          if (-not (Test-DllPath $dll)) {\n" +
            "            $kp = $baseObj.kpBase + '\\' + $clsid\n" +
            "            Add-Issue 'Interface' $clsid $kp '' $dll 'DeleteKey' ('DLL not found: ' + $dll)\n" +
            "          }\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptInvalidFileExtensions() {
        return
            "  $extBases = @(\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\Classes'; kpBase='HKEY_LOCAL_MACHINE\\SOFTWARE\\Classes' },\n" +
            "    @{ ps='HKCU:\\Software\\Classes'; kpBase='HKEY_CURRENT_USER\\Software\\Classes' }\n" +
            "  )\n" +
            "  $seenExts = @{}\n" +
            "  foreach ($baseObj in $extBases) {\n" +
            "    foreach ($key in (Get-ChildItem $baseObj.ps -EA SilentlyContinue | Where-Object { $_.PSChildName -match '^\\.\\w' })) {\n" +
            "      $def = (Get-ItemProperty $key.PSPath -EA SilentlyContinue).'(default)'\n" +
            "      if ($def -and $def.Trim() -ne '') {\n" +
            "        $progId = $def.Trim()\n" +
            "        $dedupKey = ($key.PSChildName + '|' + $progId).ToLower()\n" +
            "        if (-not $seenExts[$dedupKey]) {\n" +
            "          $seenExts[$dedupKey] = $true\n" +
            "          $exists = (Test-Path ('HKLM:\\SOFTWARE\\Classes\\' + $progId) -EA SilentlyContinue) -or\n" +
            "                    (Test-Path ('HKCU:\\Software\\Classes\\' + $progId) -EA SilentlyContinue)\n" +
            "          if (-not $exists) {\n" +
            "            $kp = $baseObj.kpBase + '\\' + $key.PSChildName\n" +
            "            Add-Issue 'Invalid File Extensions' $key.PSChildName $kp '(default)' $progId 'DeleteValue' ('ProgID not found: ' + $progId)\n" +
            "          }\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptInstallers() {
        return
            "  $uninstBases = @(\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; kp='HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; kp='HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },\n" +
            "    @{ ps='HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; kp='HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' }\n" +
            "  )\n" +
            "  foreach ($baseObj in $uninstBases) {\n" +
            "    foreach ($key in (Get-ChildItem $baseObj.ps -EA SilentlyContinue)) {\n" +
            "      $p = Get-ItemProperty $key.PSPath -EA SilentlyContinue\n" +
            "      $displayName = [string]$p.DisplayName\n" +
            "      if (-not $displayName) { continue }\n" +
            "      $installLoc = [string]$p.InstallLocation\n" +
            "      if ($installLoc -and $installLoc.Trim() -ne '') {\n" +
            "        $loc = [Environment]::ExpandEnvironmentVariables($installLoc.Trim().Trim('\"'))\n" +
            "        if (-not (Test-Path $loc -EA SilentlyContinue)) {\n" +
            "          $kp = $baseObj.kp + '\\' + $key.PSChildName\n" +
            "          Add-Issue 'Installers' $displayName $kp 'InstallLocation' $installLoc 'DeleteKey' ('Install location not found: ' + $loc)\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptObsoleteSoftware() {
        return
            "  $uninstBases = @(\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; kp='HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },\n" +
            "    @{ ps='HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; kp='HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall' },\n" +
            "    @{ ps='HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'; kp='HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' }\n" +
            "  )\n" +
            "  foreach ($baseObj in $uninstBases) {\n" +
            "    foreach ($key in (Get-ChildItem $baseObj.ps -EA SilentlyContinue)) {\n" +
            "      $p = Get-ItemProperty $key.PSPath -EA SilentlyContinue\n" +
            "      if ([int]($p.SystemComponent) -eq 1) { continue }\n" +
            "      $displayName = [string]$p.DisplayName\n" +
            "      $uninstStr = [string]$p.UninstallString\n" +
            "      $kp = $baseObj.kp + '\\' + $key.PSChildName\n" +
            "      if (-not $displayName -and -not $uninstStr) {\n" +
            "        Add-Issue 'Obsolete Software' $key.PSChildName $kp '' '' 'DeleteKey' 'Empty entry (no name or uninstaller)'\n" +
            "      } elseif ($uninstStr) {\n" +
            "        $f = Get-CmdPath ([Environment]::ExpandEnvironmentVariables($uninstStr))\n" +
            "        if ($f -and -not (Test-Path $f -EA SilentlyContinue)) {\n" +
            "          Add-Issue 'Obsolete Software' ($displayName + ' [' + $key.PSChildName + ']') $kp 'UninstallString' $uninstStr 'DeleteKey' ('Uninstaller not found: ' + $f)\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptOpenWithApplication() {
        return
            "  $fileExtsBase = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts'\n" +
            "  $kpBase = 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts'\n" +
            "  foreach ($extKey in (Get-ChildItem $fileExtsBase -EA SilentlyContinue | Select-Object -First 200)) {\n" +
            "    $owlPath = Join-Path $extKey.PSPath 'OpenWithList'\n" +
            "    if (Test-Path $owlPath) {\n" +
            "      $owlProps = Get-ItemProperty $owlPath -EA SilentlyContinue\n" +
            "      if ($owlProps) {\n" +
            "        $owlProps.PSObject.Properties | Where-Object { $skip -notcontains $_.Name -and $_.Name -ne 'MRUList' } | ForEach-Object {\n" +
            "          $appName = [string]$_.Value\n" +
            "          if ($appName -match '^[A-Za-z]:\\\\.*\\.exe$' -and -not (Test-Path $appName -EA SilentlyContinue)) {\n" +
            "            $kp = $kpBase + '\\' + $extKey.PSChildName + '\\OpenWithList'\n" +
            "            Add-Issue 'Open with Application' ($extKey.PSChildName + ': ' + $appName) $kp $_.Name $appName 'DeleteValue' 'Application not found'\n" +
            "          }\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    private String scriptSoundEvents() {
        return
            "  $soundBase = 'HKCU:\\AppEvents\\Schemes\\Apps'\n" +
            "  $kpBase = 'HKEY_CURRENT_USER\\AppEvents\\Schemes\\Apps'\n" +
            "  $counter = 0\n" +
            "  :outer foreach ($app in (Get-ChildItem $soundBase -EA SilentlyContinue | Select-Object -First 50)) {\n" +
            "    foreach ($evt in (Get-ChildItem $app.PSPath -EA SilentlyContinue)) {\n" +
            "      $curPath = Join-Path $evt.PSPath '.Current'\n" +
            "      if (Test-Path $curPath) {\n" +
            "        $val = (Get-ItemProperty $curPath -EA SilentlyContinue).'(default)'\n" +
            "        if ($val -and $val.Trim() -ne '' -and $val.Trim() -ne '.') {\n" +
            "          $f = [Environment]::ExpandEnvironmentVariables($val)\n" +
            "          if (-not (Test-Path $f -EA SilentlyContinue)) {\n" +
            "            $kp = $kpBase + '\\' + $app.PSChildName + '\\' + $evt.PSChildName + '\\.Current'\n" +
            "            Add-Issue 'Sound Events' ($app.PSChildName + '\\' + $evt.PSChildName) $kp '(default)' $val 'DeleteValue' 'Sound file not found'\n" +
            "            $counter++\n" +
            "            if ($counter -ge 100) { break outer }\n" +
            "          }\n" +
            "        }\n" +
            "      }\n" +
            "    }\n" +
            "  }\n";
    }

    // -------------------------------------------------------------------------
    // I/O helpers
    // -------------------------------------------------------------------------

    private File writeTempScript(String content) throws IOException {
        File f = File.createTempFile("rmx_regscan_", ".ps1");
        try (OutputStreamWriter w = new OutputStreamWriter(new FileOutputStream(f), StandardCharsets.UTF_8)) {
            w.write(content);
        }
        return f;
    }

    private String runPs(File scriptFile) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(
            "powershell.exe", "-NoProfile", "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-File", scriptFile.getAbsolutePath()
        );
        pb.redirectErrorStream(false);
        Process process = pb.start();
        StringBuilder stdout = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                stdout.append(line).append("\n");
            }
        }
        try (BufferedReader errReader = new BufferedReader(
                new InputStreamReader(process.getErrorStream(), StandardCharsets.UTF_8))) {
            while (errReader.readLine() != null) { /* discard */ }
        }
        try { process.waitFor(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        return stdout.toString();
    }

    private byte[] readFileBytes(File f) throws IOException {
        try (FileInputStream fis = new FileInputStream(f)) {
            byte[] data = new byte[(int) f.length()];
            int total = 0;
            while (total < data.length) {
                int read = fis.read(data, total, data.length - total);
                if (read == -1) break;
                total += read;
            }
            return data;
        }
    }
}
