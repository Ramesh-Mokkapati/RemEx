package com.remex.RemExService.helpers;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Collections;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class TaskSchedulerHelper {

    private static final Logger LOGGER = LoggerFactory.getLogger(TaskSchedulerHelper.class);
    private static final String SCHTASKS = System.getenv("windir") + "\\system32\\schtasks.exe";
    private static final String CMD = System.getenv("windir") + "\\system32\\cmd.exe";

    public List<Map<String, String>> listTasks() throws IOException {
        List<String> lines = runCommand(SCHTASKS, "/Query", "/FO", "CSV", "/V");
        if (lines.isEmpty()) {
            return new ArrayList<>();
        }

        // join all lines and parse CSV records robustly (handles quoted fields with newlines)
        String raw = String.join("\n", lines);
        List<List<String>> records = parseCsvRecords(raw);
        if (records.isEmpty()) return new ArrayList<>();

        List<String> headers = records.get(0);
        // try to find which header contains task name
        int taskNameIdx = -1;
        for (int i = 0; i < headers.size(); i++) {
            String h = headers.get(i);
            if (h == null) continue;
            String hh = h.trim();
            if ("TaskName".equalsIgnoreCase(hh) || "Task".equalsIgnoreCase(hh) || hh.toLowerCase().contains("task")) { taskNameIdx = i; break; }
        }
        if (taskNameIdx == -1) {
            LOGGER.warn("Could not detect TaskName header from schtasks output. Headers: {}", headers);
        }

        // dedupe by normalized TaskName while preserving order
        LinkedHashMap<String, Map<String, String>> dedup = new LinkedHashMap<>();
        for (int r = 1; r < records.size(); r++) {
            List<String> fields = records.get(r);
            if (fields == null || fields.isEmpty()) continue;
            if (fields.size() != headers.size()) {
                LOGGER.warn("CSV record field count differs from headers. recordIndex={} fields={} headers={} recordFields={}", r, fields.size(), headers.size(), fields);
            }
            int len = Math.min(headers.size(), fields.size());
            Map<String, String> task = new HashMap<>();
            for (int j = 0; j < len; j++) {
                String key = headers.get(j);
                String val = fields.get(j) == null ? "" : fields.get(j).trim();
                task.put(key, val);
            }

            String rawName = null;
            if (taskNameIdx >= 0 && task.containsKey(headers.get(taskNameIdx))) rawName = task.get(headers.get(taskNameIdx));
            if ((rawName == null || rawName.isEmpty()) && task.containsKey("TaskName")) rawName = task.get("TaskName");
            if (rawName == null || rawName.isEmpty()) {
                LOGGER.warn("Skipping task record with empty TaskName. recordIndex={} fields={}", r, fields);
                continue;
            }

            String norm = rawName.replace('/', '\\').trim();
            if (!norm.startsWith("\\")) norm = "\\" + norm;
            // collapse multiple backslashes
            norm = norm.replaceAll("\\\\{2,}", "\\\\");

            task.put("TaskName", norm);
            task.put("TaskPath", norm);

            if (!dedup.containsKey(norm)) {
                dedup.put(norm, task);
            }
        }

        return new ArrayList<>(dedup.values());
    }

    public List<String> listTaskFolders() throws IOException {
        // Build a sorted, deduplicated list of folders from normalized TaskName
        List<String> out = new ArrayList<>();
        for (Map<String, String> task : listTasks()) {
            String taskName = task.get("TaskName");
            if (taskName == null || taskName.isEmpty()) continue;
            int idx = taskName.lastIndexOf('\\');
            if (idx > 0) {
                out.add(taskName.substring(0, idx));
            } else {
                out.add("\\");
            }
        }
        // dedupe while preserving order
        List<String> dedup = new ArrayList<>();
        for (String f : out) {
            if (!dedup.contains(f)) dedup.add(f);
        }
        Collections.sort(dedup);
        // keep root "\\" at the front if present
        if (dedup.remove("\\")) dedup.add(0, "\\");
        return dedup;
    }

    public String createTask(String taskName, String folder, String command, String arguments, String workingDirectory,
                             String scheduleType, String startDate, String startTime, String runAsUser, String runAsPassword) throws IOException {
        if (taskName == null || taskName.isEmpty()) {
            throw new IllegalArgumentException("TaskName is required.");
        }
        if (command == null || command.isEmpty()) {
            throw new IllegalArgumentException("Command is required.");
        }
        if (scheduleType == null || scheduleType.isEmpty()) {
            scheduleType = "ONCE";
        }
        if (startTime == null || startTime.isEmpty()) {
            throw new IllegalArgumentException("StartTime is required.");
        }

        String taskPath = formatTaskPath(folder, taskName);
        String trCommand = buildScheduledCommand(command, arguments, workingDirectory);
        List<String> cmd = new ArrayList<>();
        cmd.add(SCHTASKS);
        cmd.add("/Create");
        cmd.add("/TN");
        cmd.add(taskPath);
        cmd.add("/TR");
        cmd.add(trCommand);
        cmd.add("/SC");
        cmd.add(scheduleType);

        if ("ONCE".equalsIgnoreCase(scheduleType) || "DAILY".equalsIgnoreCase(scheduleType)) {
            cmd.add("/ST");
            cmd.add(startTime);
        }
        if (startDate != null && !startDate.isEmpty()) {
            cmd.add("/SD");
            cmd.add(startDate);
        }
        if (runAsUser != null && !runAsUser.isEmpty() && !"SYSTEM".equalsIgnoreCase(runAsUser)) {
            cmd.add("/RU");
            cmd.add(runAsUser);
            if (runAsPassword != null && !runAsPassword.isEmpty()) {
                cmd.add("/RP");
                cmd.add(runAsPassword);
            }
        }
        cmd.add("/F");
        runCommand(cmd.toArray(new String[0]));
        return "Created task " + taskPath;
    }

    public String deleteTask(String taskName, String folder) throws IOException {
        if (taskName == null || taskName.isEmpty()) {
            throw new IllegalArgumentException("TaskName is required.");
        }
        String taskPath = formatTaskPath(folder, taskName);
        runCommand(SCHTASKS, "/Delete", "/TN", taskPath, "/F");
        return "Deleted task " + taskPath;
    }

    public String enableTask(String taskName, String folder) throws IOException {
        if (taskName == null || taskName.isEmpty()) {
            throw new IllegalArgumentException("TaskName is required.");
        }
        String taskPath = formatTaskPath(folder, taskName);
        runCommand(SCHTASKS, "/Change", "/TN", taskPath, "/Enable");
        return "Enabled task " + taskPath;
    }

    public String disableTask(String taskName, String folder) throws IOException {
        if (taskName == null || taskName.isEmpty()) {
            throw new IllegalArgumentException("TaskName is required.");
        }
        String taskPath = formatTaskPath(folder, taskName);
        runCommand(SCHTASKS, "/Change", "/TN", taskPath, "/Disable");
        return "Disabled task " + taskPath;
    }

    public String createTaskFolder(String folder) throws IOException {
        if (folder == null || folder.isEmpty()) {
            throw new IllegalArgumentException("Folder is required.");
        }
        String normalizedFolder = ensureFolderPrefix(folder);
        String markerTask = normalizedFolder + "\\__rmx_folder_marker__";
        runCommand(SCHTASKS, "/Create", "/TN", markerTask, "/SC", "ONCE", "/ST", "00:00", "/TR", CMD + " /c exit", "/F");
        runCommand(SCHTASKS, "/Delete", "/TN", markerTask, "/F");
        return "Created task folder " + normalizedFolder;
    }

    public String deleteTaskFolder(String folder) throws IOException {
        if (folder == null || folder.isEmpty()) {
            throw new IllegalArgumentException("Folder is required.");
        }
        String normalizedFolder = ensureFolderPrefix(folder);
        List<Map<String, String>> tasks = listTasks();
        List<String> toDelete = new ArrayList<>();
        for (Map<String, String> task : tasks) {
            String taskName = task.get("TaskName");
            if (taskName != null && taskName.startsWith(normalizedFolder + "\\")) {
                toDelete.add(taskName);
            }
        }
        if (toDelete.isEmpty()) {
            return "No tasks found in folder " + normalizedFolder;
        }
        for (String taskPath : toDelete) {
            runCommand(SCHTASKS, "/Delete", "/TN", taskPath, "/F");
        }
        return "Deleted " + toDelete.size() + " tasks from " + normalizedFolder;
    }

    public String renameTaskFolder(String folder, String newFolder) throws IOException {
        if (folder == null || folder.isEmpty() || newFolder == null || newFolder.isEmpty()) {
            throw new IllegalArgumentException("Folder and NewFolder are required.");
        }
        String oldFolder = ensureFolderPrefix(folder);
        String newFolderPath = ensureFolderPrefix(newFolder);
        List<Map<String, String>> tasks = listTasks();
        List<String> toMove = new ArrayList<>();
        for (Map<String, String> task : tasks) {
            String taskName = task.get("TaskName");
            if (taskName != null && taskName.startsWith(oldFolder + "\\")) {
                toMove.add(taskName);
            }
        }
        if (toMove.isEmpty()) {
            return "No tasks found in folder " + oldFolder;
        }
        for (String oldTaskPath : toMove) {
            String newTaskPath = newFolderPath + oldTaskPath.substring(oldFolder.length());
            Path xmlFile = Files.createTempFile("rmx-task", ".xml");
            try {
                exportTaskXml(oldTaskPath, xmlFile.toFile());
                runCommand(SCHTASKS, "/Create", "/TN", newTaskPath, "/XML", xmlFile.toAbsolutePath().toString(), "/F");
                runCommand(SCHTASKS, "/Delete", "/TN", oldTaskPath, "/F");
            } finally {
                Files.deleteIfExists(xmlFile);
            }
        }
        return "Renamed folder " + oldFolder + " to " + newFolderPath;
    }

    public String modifyTask(String taskName, String folder, String newTaskName, String command, String arguments,
                             String workingDirectory, String scheduleType, String startDate, String startTime,
                             String runAsUser, String runAsPassword) throws IOException {
        if (taskName == null || taskName.isEmpty()) {
            throw new IllegalArgumentException("TaskName is required.");
        }
        String existingTaskPath = formatTaskPath(folder, taskName);
        String targetTaskName = (newTaskName == null || newTaskName.isEmpty()) ? taskName : newTaskName;
        String targetFolder = folder;
        if (newTaskName != null && newTaskName.contains("\\")) {
            targetFolder = newTaskName.substring(0, newTaskName.lastIndexOf('\\'));
            targetTaskName = newTaskName.substring(newTaskName.lastIndexOf('\\') + 1);
        }
        deleteTask(taskName, folder);
        return createTask(targetTaskName, targetFolder, command, arguments, workingDirectory, scheduleType, startDate, startTime, runAsUser, runAsPassword);
    }

    private void exportTaskXml(String taskPath, File outputFile) throws IOException {
        List<String> cmd = runCommand(SCHTASKS, "/Query", "/TN", taskPath, "/XML");
        try (FileOutputStream out = new FileOutputStream(outputFile)) {
            for (String line : cmd) {
                out.write((line + System.lineSeparator()).getBytes());
            }
        }
    }

    // Export task XML and return as a string (temporary file is cleaned up)
    public String getTaskXml(String taskPath) throws IOException {
        Path xmlFile = Files.createTempFile("rmx-task-export", ".xml");
        try {
            exportTaskXml(taskPath, xmlFile.toFile());
            byte[] bytes = Files.readAllBytes(xmlFile);
            return new String(bytes, StandardCharsets.UTF_8);
        } finally {
            Files.deleteIfExists(xmlFile);
        }
    }

    private List<String> runCommand(String... command) throws IOException {
        ProcessBuilder processBuilder = new ProcessBuilder(command);
        processBuilder.redirectErrorStream(true);
        Process process = processBuilder.start();
        BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()));
        List<String> output = new ArrayList<>();
        String line;
        while ((line = reader.readLine()) != null) {
            output.add(line);
        }
        try {
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IOException("Command failed with exit code " + exitCode + ": " + String.join("\n", output));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Command interrupted", e);
        }
        return output;
    }

    private List<List<String>> parseCsvRecords(String raw) {
        List<List<String>> records = new ArrayList<>();
        List<String> currentRecord = new ArrayList<>();
        StringBuilder currentField = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c == '"') {
                if (inQuotes && i + 1 < raw.length() && raw.charAt(i + 1) == '"') {
                    currentField.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c == ',' && !inQuotes) {
                currentRecord.add(currentField.toString());
                currentField.setLength(0);
            } else if ((c == '\n' || c == '\r') && !inQuotes) {
                // normalize CRLF
                if (c == '\r' && i + 1 < raw.length() && raw.charAt(i + 1) == '\n') i++;
                currentRecord.add(currentField.toString());
                currentField.setLength(0);
                records.add(new ArrayList<>(currentRecord));
                currentRecord.clear();
            } else {
                currentField.append(c);
            }
        }
        // flush last
        if (currentField.length() > 0 || !currentRecord.isEmpty()) {
            currentRecord.add(currentField.toString());
            records.add(new ArrayList<>(currentRecord));
        }
        return records;
    }

    private String formatTaskPath(String folder, String taskName) {
        String normalizedFolder = ensureFolderPrefix(folder);
        if (normalizedFolder.endsWith("\\")) {
            normalizedFolder = normalizedFolder.substring(0, normalizedFolder.length() - 1);
        }
        if (taskName.startsWith("\\")) {
            taskName = taskName.substring(1);
        }
        return normalizedFolder + "\\" + taskName;
    }

    private String ensureFolderPrefix(String folder) {
        if (folder == null || folder.isEmpty()) {
            return "\\";
        }
        String normalized = folder.replace('/', '\\');
        if (!normalized.startsWith("\\")) {
            normalized = "\\" + normalized;
        }
        return normalized;
    }

    private String buildScheduledCommand(String command, String arguments, String workingDirectory) {
        String fullCommand = command.trim();
        if (arguments != null && !arguments.trim().isEmpty()) {
            fullCommand += " " + arguments.trim();
        }
        if (workingDirectory != null && !workingDirectory.trim().isEmpty()) {
            String workingDir = workingDirectory.trim();
            return CMD + " /c " + quote("cd /d " + workingDir + " && " + fullCommand);
        }
        return fullCommand;
    }

    private String quote(String value) {
        return "\"" + value.replace("\"", "\\\"") + "\"";
    }

    private List<String> parseCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                if (inQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    current.append('"');
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (c == ',' && !inQuotes) {
                fields.add(current.toString());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        fields.add(current.toString());
        return fields;
    }
}
