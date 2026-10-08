package com.remex.RemExService.controllers;

import com.remex.RemExService.services.RegistryCleanerService;
import com.remex.common.helpers.RequestHelper;
import com.remex.common.models.EventLog;
import com.remex.common.service.MessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.util.*;

@RestController
@RequestMapping("/v1/rmxrsms")
public class RegistryCleanerController {

    private static final Logger logger = LoggerFactory.getLogger(RegistryCleanerController.class);

    @Autowired
    private RegistryCleanerService registryCleanerService;

    @Autowired
    private HttpServletRequest request;

    @Autowired
    private MessageService messageService;

    @GetMapping("/regcleaner/categories")
    public ResponseEntity<String[]> getCategories() {
        return ResponseEntity.ok(RegistryCleanerService.ALL_CATEGORIES);
    }

    @GetMapping("/regcleaner/scan")
    public ResponseEntity<?> scan(
            @RequestParam(required = false, defaultValue = "") String categories) {
        try {
            List<String> cats = parseCategories(categories);
            List<Map<String, Object>> issues = registryCleanerService.scan(cats);
            audit("Registry scan: " + cats.size() + " categories, " + issues.size() + " issues found");
            return ResponseEntity.ok(issues);
        } catch (Exception e) {
            logger.error("Registry scan failed", e);
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/regcleaner/scan/async")
    public ResponseEntity<?> scanAsync(
            @RequestParam(required = false, defaultValue = "") String categories) {
        List<String> cats = parseCategories(categories);
        RegistryCleanerService.ScanJob job = registryCleanerService.startScanAsync(cats);
        audit("Registry async scan started: " + cats.size() + " categories, jobId=" + job.jobId);
        return ResponseEntity.ok(Collections.singletonMap("jobId", job.jobId));
    }

    @GetMapping("/regcleaner/scan/status/{jobId}")
    public ResponseEntity<?> scanStatus(@PathVariable String jobId) {
        RegistryCleanerService.ScanJob job = registryCleanerService.getScanJob(jobId);
        if (job == null) {
            return ResponseEntity.notFound().build();
        }
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("status", job.status);
        if ("complete".equals(job.status)) {
            resp.put("issues", job.results);
            audit("Registry async scan complete: jobId=" + jobId + ", " + job.results.size() + " issues found");
        } else if ("error".equals(job.status)) {
            resp.put("error", job.error);
        }
        return ResponseEntity.ok(resp);
    }

    private List<String> parseCategories(String categories) {
        if (categories == null || categories.trim().isEmpty()) {
            return Arrays.asList(RegistryCleanerService.ALL_CATEGORIES);
        }
        String[] parts = categories.split(",");
        List<String> cats = new ArrayList<>();
        for (String p : parts) {
            String trimmed = p.trim();
            if (!trimmed.isEmpty()) cats.add(trimmed);
        }
        return cats;
    }

    @PostMapping("/regcleaner/fix")
    public ResponseEntity<?> fix(@RequestBody List<Map<String, Object>> issues) {
        try {
            registryCleanerService.fix(issues);
            audit("Registry fix: " + issues.size() + " issues fixed");
            return ResponseEntity.ok(Collections.singletonMap("fixed", issues.size()));
        } catch (Exception e) {
            logger.error("Registry fix failed", e);
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/regcleaner/backup")
    public ResponseEntity<?> backup(@RequestBody List<String> keyPaths) {
        try {
            byte[] data = registryCleanerService.backup(keyPaths);
            if (data.length == 0) {
                return ResponseEntity.badRequest().body(Collections.singletonMap("error", "No registry data to backup"));
            }
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"registry_backup.reg\"")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(data);
        } catch (Exception e) {
            logger.error("Registry backup failed", e);
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
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
