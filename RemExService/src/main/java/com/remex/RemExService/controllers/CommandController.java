package com.remex.RemExService.controllers;

import com.remex.RemExService.helpers.TaskSchedulerHelper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.remex.common.helpers.RequestHelper;
import com.remex.common.models.EventLog;
import com.remex.common.service.MessageService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

@RestController
@RequestMapping("/v1/rmxrsms")
public class CommandController {
    private static final Logger logger = LoggerFactory.getLogger(CommandController.class);

    @Autowired
    private HttpServletRequest request;

    @Autowired
    private MessageService messageService;

    @PostMapping(value = "/executecommand", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> executeCommand(@RequestParam String Command) {

        List<String> commandOutput = new ArrayList<>();
        try {

            // Split on whitespace so "C:\RMX\rmxutil.exe build" becomes
            // ["C:\RMX\rmxutil.exe", "build"] — ProcessBuilder.command(String)
            // treats the entire string as the executable name and never passes args.
            String[] tokens = Command.trim().split("\\s+");
            ProcessBuilder processBuilder = new ProcessBuilder();
            processBuilder.command(tokens);

            Process process = processBuilder.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));

            String sLine;
            while ((sLine = reader.readLine()) != null) {
                commandOutput.add(sLine);
            }

        } catch (IOException e) {
            logger.error("executeCommand failed", e);
            return new ResponseEntity<String>("Unable to execute command.", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Executed Command from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<List<String>>(commandOutput, HttpStatus.OK);
    }

    @GetMapping(path = "/listtasks", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> listTasks() {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            List<Map<String, String>> output = helper.listTasks();
            return new ResponseEntity<>(output, HttpStatus.OK);
        } catch (IOException e) {
            logger.error("listTasks failed", e);
            return new ResponseEntity<String>("Unable to list tasks.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping(path = "/listtaskfolders", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> listTaskFolders() {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            List<String> folders = helper.listTaskFolders();
            return new ResponseEntity<>(folders, HttpStatus.OK);
        } catch (IOException e) {
            logger.error("listTaskFolders failed", e);
            return new ResponseEntity<String>("Unable to list task folders.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PostMapping(path = "/createtask", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> createTask(@RequestBody Map<String, String> requestBody) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String taskName = requestBody.get("TaskName");
            String folder = requestBody.get("Folder");
            String command = requestBody.get("Command");
            String arguments = requestBody.get("Arguments");
            String workingDirectory = requestBody.get("WorkingDirectory");
            String scheduleType = requestBody.get("ScheduleType");
            String startDate = requestBody.get("StartDate");
            String startTime = requestBody.get("StartTime");
            String runAsUser = requestBody.getOrDefault("RunAsUser", "SYSTEM");
            String runAsPassword = requestBody.get("RunAsPassword");
            String result = helper.createTask(taskName, folder, command, arguments, workingDirectory, scheduleType, startDate, startTime, runAsUser, runAsPassword);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("createTask failed", e);
            return new ResponseEntity<String>("Unable to create task.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PutMapping(path = "/modifytask", consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> modifyTask(@RequestBody Map<String, String> requestBody) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String taskName = requestBody.get("TaskName");
            String folder = requestBody.get("Folder");
            String newTaskName = requestBody.get("NewTaskName");
            String command = requestBody.get("Command");
            String arguments = requestBody.get("Arguments");
            String workingDirectory = requestBody.get("WorkingDirectory");
            String scheduleType = requestBody.get("ScheduleType");
            String startDate = requestBody.get("StartDate");
            String startTime = requestBody.get("StartTime");
            String runAsUser = requestBody.getOrDefault("RunAsUser", "SYSTEM");
            String runAsPassword = requestBody.get("RunAsPassword");
            String result = helper.modifyTask(taskName, folder, newTaskName, command, arguments, workingDirectory, scheduleType, startDate, startTime, runAsUser, runAsPassword);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("modifyTask failed", e);
            return new ResponseEntity<String>("Unable to modify task.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @DeleteMapping(path = "/deletetask")
    public ResponseEntity<?> deleteTask(@RequestParam String TaskName, @RequestParam(required = false) String Folder) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String result = helper.deleteTask(TaskName, Folder);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("deleteTask failed", e);
            return new ResponseEntity<String>("Unable to delete task.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PutMapping(path = "/enabletask")
    public ResponseEntity<?> enableTask(@RequestParam String TaskName, @RequestParam(required = false) String Folder) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String result = helper.enableTask(TaskName, Folder);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("enableTask failed", e);
            return new ResponseEntity<String>("Unable to enable task.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PutMapping(path = "/disabletask")
    public ResponseEntity<?> disableTask(@RequestParam String TaskName, @RequestParam(required = false) String Folder) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String result = helper.disableTask(TaskName, Folder);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("disableTask failed", e);
            return new ResponseEntity<String>("Unable to disable task.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping(path = "/exporttask", produces = MediaType.APPLICATION_XML_VALUE)
    public ResponseEntity<?> exportTask(@RequestParam String TaskPath) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String xml = helper.getTaskXml(TaskPath);
            String fileName = TaskPath.substring(TaskPath.lastIndexOf('\\') + 1) + ".xml";
            return ResponseEntity.ok()
                    .header("Content-Disposition", "attachment; filename=\"" + fileName + "\"")
                    .contentType(MediaType.APPLICATION_XML)
                    .body(xml);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("exportTask failed", e);
            return new ResponseEntity<String>("Unable to export task.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PostMapping(path = "/createtaskfolder")
    public ResponseEntity<?> createTaskFolder(@RequestParam String Folder) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String result = helper.createTaskFolder(Folder);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("createTaskFolder failed", e);
            return new ResponseEntity<String>("Unable to create task folder.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @PutMapping(path = "/renametaskfolder")
    public ResponseEntity<?> renameTaskFolder(@RequestParam String Folder, @RequestParam String NewFolder) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String result = helper.renameTaskFolder(Folder, NewFolder);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("renameTaskFolder failed", e);
            return new ResponseEntity<String>("Unable to rename task folder.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @DeleteMapping(path = "/deletetaskfolder")
    public ResponseEntity<?> deleteTaskFolder(@RequestParam String Folder) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String result = helper.deleteTaskFolder(Folder);
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (IOException e) {
            logger.error("deleteTaskFolder failed", e);
            return new ResponseEntity<String>("Unable to delete task folder.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @GetMapping(path = "/gettask", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> getTask(@RequestParam String TaskPath) {
        TaskSchedulerHelper helper = new TaskSchedulerHelper();
        try {
            String xml = helper.getTaskXml(TaskPath);

            Map<String, Object> out = new HashMap<>();
            out.put("xml", xml);

            // parse XML for common fields
            DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
            dbf.setNamespaceAware(false);
            DocumentBuilder db = dbf.newDocumentBuilder();
            Document doc = db.parse(new InputSource(new StringReader(xml)));
            doc.getDocumentElement().normalize();

            // Description
            NodeList desc = doc.getElementsByTagName("Description");
            if (desc != null && desc.getLength() > 0) out.put("Description", desc.item(0).getTextContent());

            // RunAsUser (UserId under Principals/Principal)
            NodeList userNodes = doc.getElementsByTagName("UserId");
            if (userNodes != null && userNodes.getLength() > 0) out.put("RunAsUser", userNodes.item(0).getTextContent());

            // Actions — Exec / Command / Arguments
            NodeList execs = doc.getElementsByTagName("Exec");
            List<Map<String, String>> actions = new ArrayList<>();
            for (int i = 0; i < execs.getLength(); i++) {
                Element exec = (Element) execs.item(i);
                String command = "";
                String arguments = "";
                NodeList cmdNodes = exec.getElementsByTagName("Command");
                if (cmdNodes.getLength() > 0) command = cmdNodes.item(0).getTextContent();
                NodeList argNodes = exec.getElementsByTagName("Arguments");
                if (argNodes.getLength() > 0) arguments = argNodes.item(0).getTextContent();
                Map<String, String> a = new HashMap<>();
                a.put("Command", command == null ? "" : command);
                a.put("Arguments", arguments == null ? "" : arguments);
                a.put("WorkingDirectory", "");
                actions.add(a);
            }
            out.put("Actions", actions);

            // Triggers — capture node names and StartBoundary if present
            List<Map<String, String>> triggers = new ArrayList<>();
            NodeList triggersNodes = doc.getElementsByTagName("Triggers");
            if (triggersNodes != null && triggersNodes.getLength() > 0) {
                NodeList children = triggersNodes.item(0).getChildNodes();
                for (int i = 0; i < children.getLength(); i++) {
                    Node ch = children.item(i);
                    if (ch.getNodeType() != Node.ELEMENT_NODE) continue;
                    String type = ch.getNodeName();
                    String startBoundary = "";
                    if (ch instanceof Element) {
                        NodeList sb = ((Element) ch).getElementsByTagName("StartBoundary");
                        if (sb.getLength() > 0) startBoundary = sb.item(0).getTextContent();
                    }
                    Map<String, String> tr = new HashMap<>();
                    tr.put("Type", type.toUpperCase());
                    tr.put("StartBoundary", startBoundary == null ? "" : startBoundary);
                    triggers.add(tr);
                }
            }
            out.put("Triggers", triggers);

            // Conditions — basic flags
            Map<String, Object> conditions = new HashMap<>();
            NodeList runOnlyIfIdle = doc.getElementsByTagName("RunOnlyIfIdle");
            conditions.put("RunOnlyIfIdle", runOnlyIfIdle != null && runOnlyIfIdle.getLength() > 0 && "true".equalsIgnoreCase(runOnlyIfIdle.item(0).getTextContent()));
            NodeList runOnlyIfNetworkAvailable = doc.getElementsByTagName("RunOnlyIfNetworkAvailable");
            conditions.put("RunOnlyIfNetworkAvailable", runOnlyIfNetworkAvailable != null && runOnlyIfNetworkAvailable.getLength() > 0 && "true".equalsIgnoreCase(runOnlyIfNetworkAvailable.item(0).getTextContent()));
            // best-effort: IdleMinutes default
            conditions.put("IdleMinutes", 10);
            conditions.put("StopIfIdle", false);
            out.put("Conditions", conditions);

            // Settings — best-effort fields
            Map<String, Object> settings = new HashMap<>();
            NodeList runLevel = doc.getElementsByTagName("RunLevel");
            boolean runWithHighest = false;
            if (runLevel != null && runLevel.getLength() > 0) {
                String rl = runLevel.item(0).getTextContent();
                runWithHighest = rl != null && rl.equalsIgnoreCase("HIGHEST");
            }
            settings.put("RunWithHighestPrivileges", runWithHighest);
            NodeList runOnlyIfLoggedOn = doc.getElementsByTagName("RunOnlyIfLoggedOn");
            settings.put("RunWhenUserLoggedOn", runOnlyIfLoggedOn != null && runOnlyIfLoggedOn.getLength() > 0 && "true".equalsIgnoreCase(runOnlyIfLoggedOn.item(0).getTextContent()));
            settings.put("DeleteIfMissed", false);
            out.put("Settings", settings);

            return new ResponseEntity<>(out, HttpStatus.OK);
        } catch (IllegalArgumentException e) {
            return new ResponseEntity<String>(e.getMessage(), HttpStatus.BAD_REQUEST);
        } catch (Exception e) {
            logger.error("getTask failed", e);
            return new ResponseEntity<String>("Unable to get task.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

}