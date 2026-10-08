package com.remex.RemExService.controllers;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.profesorfalken.jpowershell.PowerShell;
import com.profesorfalken.jpowershell.PowerShellResponse;
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
import java.util.*;
import java.util.regex.Pattern;

import static java.lang.System.getenv;

@RestController
@RequestMapping("/v1/rmxrsms")
public class InfoController {

    private static final Logger logger = LoggerFactory.getLogger(InfoController.class);
    private static final Pattern SAFE_APP_NAME = Pattern.compile("^[\\w\\s\\-\\.\\(\\)\\+\\#]{1,512}$");


    @Autowired
    private HttpServletRequest request;

    @Autowired
    private MessageService messageService;

    @GetMapping(path = "/systeminfo", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getSystemInfo() {

        PowerShellResponse response = PowerShell.executeSingleCommand("Get-WmiObject -Class Win32_ComputerSystem -ComputerName.");

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Retrieved System Information " + " from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<String>(response.getCommandOutput(), HttpStatus.OK);
    }

    @GetMapping(path = "/biosinfo", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getBIOSInfo() {

        PowerShellResponse response = PowerShell.executeSingleCommand("Get-WmiObject Win32_BIOS");

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Retrieved BIOS Information " + " from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<String>(response.getCommandOutput(), HttpStatus.OK);
    }

    @GetMapping(path = "/cpuinfo", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getCPUInfo() {

        PowerShellResponse response = PowerShell.executeSingleCommand("Get-WmiObject -Class Win32_Processor -ComputerName.");

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Retrieved CPU Information " + " from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<String>(response.getCommandOutput(), HttpStatus.OK);
    }

    @GetMapping(path = "/raminfo", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getRAMInfo() {

        PowerShellResponse response = PowerShell.executeSingleCommand("Get-WmiObject -class \"win32_physicalmemory\" -namespace \"root\\CIMV2\" -ComputerName localhost | Format-Table Tag,BankLabel,@{n=\"Capacity(GB)\";e={$_.Capacity/1GB}},Manufacturer,PartNumber,Speed -AutoSize");

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Retrieved RAM Information " + " from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<String>(response.getCommandOutput(), HttpStatus.OK);
    }

    @GetMapping(path = "/diskinfo", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getDiskInfo() {

        PowerShellResponse response = PowerShell.executeSingleCommand("Get-Volume");

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Retrieved Disk Information " + " from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<String>(response.getCommandOutput(), HttpStatus.OK);
    }

    @GetMapping(path = "/osinfo", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getOSInfo() {

        PowerShellResponse response = PowerShell.executeSingleCommand("Get-CimInstance Win32_OperatingSystem|% Caption");

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Retrieved OS Information " + " from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<String>(response.getCommandOutput(), HttpStatus.OK);
    }

    @GetMapping(path = "/installedapps", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getInstalledApplications() {

        // Return structured data: name, version, publisher for each installed app.
        String psCommand =
            "Get-ItemProperty " +
            "'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'," +
            "'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' " +
            "| Where-Object { $_.DisplayName } " +
            "| Sort-Object DisplayName -Unique " +
            "| Select-Object DisplayName,DisplayVersion,Publisher,UninstallString " +
            "| ConvertTo-Json -Compress";

        PowerShellResponse response = PowerShell.executeSingleCommand(psCommand);
        String output = response.getCommandOutput();

        if (output == null || output.trim().isEmpty()) {
            return ResponseEntity.ok(Collections.emptyList());
        }

        try {
            ObjectMapper mapper = new ObjectMapper();
            String json = output.trim();
            // PowerShell returns a bare object when there is only one result;
            // normalise to an array so the caller always receives a JSON array.
            if (!json.startsWith("[")) {
                json = "[" + json + "]";
            }
            List<Map<String, Object>> apps = mapper.readValue(
                    json, new TypeReference<List<Map<String, Object>>>() {});

            RequestHelper requestHelper = new RequestHelper(request);
            EventLog auditEvent = new EventLog(request.getRemoteHost(),
                    requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(),
                    "Retrieved Installed Applications from " + request.getLocalName());
            messageService.sendMessage(auditEvent);

            return ResponseEntity.ok(apps);
        } catch (Exception e) {
            logger.error("Failed to parse installed applications output", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to parse installed applications output.");
        }
    }
}