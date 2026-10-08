package com.remex.RemExService.controllers;

import com.remex.RemExService.services.RegistryService;
import com.remex.RemExService.services.RegistryService.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.Collections;
import java.util.List;

@RestController
@RequestMapping("/v1/rmxrsms")
public class RegistryController {

    @Autowired
    private RegistryService registryService;

    @GetMapping("/registry/hives")
    public ResponseEntity<List<String>> getHives() {
        return ResponseEntity.ok(registryService.getHives());
    }

    @GetMapping("/registry/keys")
    public ResponseEntity<?> listKeys(
            @RequestParam String hive,
            @RequestParam(required = false, defaultValue = "") String path) {
        try {
            return ResponseEntity.ok(registryService.listKeys(hive, path));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @GetMapping("/registry/values")
    public ResponseEntity<?> getValues(
            @RequestParam String keyPath) {
        try {
            return ResponseEntity.ok(registryService.getValues(keyPath));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Collections.singletonMap("error", e.getMessage()));
        }
    }

    @PostMapping("/registry/keys")
    public ResponseEntity<Boolean> createKey(
            @RequestParam String keyPath) {
        try {
            return ResponseEntity.ok(registryService.createKey(keyPath));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/registry/keys")
    public ResponseEntity<Boolean> deleteKey(
            @RequestParam String keyPath) {
        try {
            return ResponseEntity.ok(registryService.deleteKey(keyPath));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/registry/values")
    public ResponseEntity<Boolean> setValue(
            @RequestParam String keyPath,
            @RequestParam(required = false, defaultValue = "") String valueName,
            @RequestParam String valueType,
            @RequestParam(required = false, defaultValue = "") String value,
            @RequestParam(required = false, defaultValue = "false") boolean defaultValue) {
        try {
            return ResponseEntity.ok(registryService.setValue(keyPath, valueName, valueType, value, defaultValue));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/registry/values")
    public ResponseEntity<Boolean> deleteValue(
            @RequestParam String keyPath,
            @RequestParam(required = false, defaultValue = "") String valueName,
            @RequestParam(required = false, defaultValue = "false") boolean defaultValue) {
        try {
            return ResponseEntity.ok(registryService.deleteValue(keyPath, valueName, defaultValue));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/registry/search")
    public ResponseEntity<List<RegistrySearchResult>> search(
            @RequestParam String hive,
            @RequestParam String searchTerm,
            @RequestParam(required = false, defaultValue = "true") boolean searchKeys,
            @RequestParam(required = false, defaultValue = "true") boolean searchValues,
            @RequestParam(required = false, defaultValue = "true") boolean searchData,
            @RequestParam(required = false, defaultValue = "false") boolean wholeMatch,
            @RequestParam(required = false, defaultValue = "true") boolean subtree) {
        try {
            return ResponseEntity.ok(registryService.search(hive, searchTerm, searchKeys, searchValues, searchData, wholeMatch, subtree));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/registry/export")
    public ResponseEntity<byte[]> exportReg(
            @RequestParam String keyPath) {
        try {
            byte[] data = registryService.exportReg(keyPath);
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"registry_export.reg\"")
                    .body(data);
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/registry/import")
    public ResponseEntity<Boolean> importReg(
            @RequestParam("file") MultipartFile file) {
        try {
            return ResponseEntity.ok(registryService.importReg(file.getInputStream()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }
}
