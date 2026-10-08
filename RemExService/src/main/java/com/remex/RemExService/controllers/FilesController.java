package com.remex.RemExService.controllers;

import com.remex.RemExService.helpers.FileHelper;
import com.remex.RemExService.helpers.FolderHelper;
import com.remex.common.helpers.RequestHelper;
import com.remex.common.models.EventLog;
import com.remex.common.service.MessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.util.FileCopyUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.*;
import java.net.URLConnection;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import static java.lang.System.getenv;

@RestController
@RequestMapping("/v1/rmxrsms")
public class FilesController {
    private static final Logger logger = LoggerFactory.getLogger(FilesController.class);

    /** Only allow filenames with safe characters — no path separators or special chars. */
    private static final Pattern SAFE_FILENAME = Pattern.compile("^[\\w\\-\\.\\s]{1,255}$");

    /**
     * Canonical-path confinement helper.
     * Verifies {@code target} resolves to a path inside {@code root} after
     * resolving all {@code ../} components, preventing path-traversal attacks.
     *
     * @throws IOException if the path escapes the root or is invalid
     */
    private static File confined(String root, String target) throws IOException {
        File rootFile   = new File(root).getCanonicalFile();
        File targetFile = new File(target).getCanonicalFile();
        String rootPath   = rootFile.getPath();
        String targetPath = targetFile.getPath();
        String rootPrefix = rootPath.endsWith(File.separator) ? rootPath : rootPath + File.separator;
        if (!targetPath.startsWith(rootPrefix) && !targetPath.equals(rootPath)) {
            throw new IOException("Path traversal detected: '" + target + "' escapes root '" + root + "'");
        }
        return targetFile;
    }

    /**
     * Builds the same "Label (C:)" display name File Explorer shows for a
     * drive, e.g. "OS (C:)". Falls back to "Local Disk (C:)" for an unnamed
     * volume, or the bare path if the volume label can't be read at all.
     */
    private static String driveDisplayName(File root, String fallbackPath) {
        try {
            String label = java.nio.file.Files.getFileStore(root.toPath()).name();
            String letter = fallbackPath.endsWith(":") ? fallbackPath : fallbackPath.replaceAll("[/\\\\]+$", "");
            if (label != null && !label.trim().isEmpty()) {
                return label.trim() + " (" + letter + ")";
            }
            return "Local Disk (" + letter + ")";
        } catch (IOException e) {
            return fallbackPath;
        }
    }

    /**
     * True if {@code child} is {@code parent} itself or resolves to a path
     * directly inside it. Handles drive-root parents (e.g. {@code C:\}),
     * whose canonical path already ends in a separator — appending another
     * separator there would otherwise break the prefix match.
     */
    private static boolean isChildOf(File parent, File child) {
        String parentPath = parent.getPath();
        String prefix = parentPath.endsWith(File.separator) ? parentPath : parentPath + File.separator;
        return child.getPath().startsWith(prefix) || child.getPath().equals(parentPath);
    }

    /**
     * Resolves a path to its canonical absolute form without confining it to
     * any particular root. File Manager browses the whole machine (all
     * drives), not just RMXDATA, so its write operations (create/rename/
     * delete/upload) resolve wherever the user has navigated rather than
     * being restricted to a single folder. A bare drive letter like "C:"
     * (no trailing separator) is normalized first, since Java/Windows would
     * otherwise interpret it as "current directory on that drive" rather
     * than the drive's actual root.
     */
    private static File canonical(String target) throws IOException {
        String normalized = target == null ? "" : target.trim();
        if (normalized.matches("^[A-Za-z]:$")) {
            normalized = normalized + File.separator;
        }
        return new File(normalized).getCanonicalFile();
    }

    /** Returns the RMXDATA root; falls back to RMXBIN if RMXDATA is not set. */
    private static String getDataRoot() {
        String root = getenv("RMXDATA");
        if (root == null || root.trim().isEmpty()) root = getenv("RMXBIN");
        if (root == null || root.trim().isEmpty()) root = "C:/RMX";
        return root;
    }

    /** Strips all directory separators and validates a filename. */
    private static String sanitiseFilename(String raw) throws IOException {
        if (raw == null) throw new IOException("Filename is null.");
        // Strip any path component — take only the last segment
        String name = Paths.get(raw).getFileName().toString();
        if (!SAFE_FILENAME.matcher(name).matches()) {
            throw new IOException("Unsafe filename: '" + name + "'");
        }
        return name;
    }

    @Autowired
    private HttpServletRequest request;

    @Autowired
    private MessageService messageService;

    /**
     * Lists the immediate contents (files AND subdirectories) of a folder.
     * Each item is: { name, path, isDirectory, size, lastModified (epoch ms) }
     */
    @GetMapping(path = "/listdirectory", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> listDirectory(@RequestParam(required = false) String Folder) {
        // No folder given -> list all available drives (e.g. C:\, D:\, ...) as
        // the virtual root, so the File Manager can browse the whole machine
        // rather than being confined to a single fixed folder.
        if (Folder == null || Folder.trim().isEmpty()) {
            List<Map<String, Object>> drives = new ArrayList<>();
            for (File root : File.listRoots()) {
                Map<String, Object> item = new HashMap<>();
                String path = root.getPath().replace("\\", "/");
                // Trim the trailing slash so the path round-trips cleanly
                // through the same breadcrumb/navigation logic as any other
                // folder (e.g. "C:/" -> "C:").
                if (path.length() > 2 && path.endsWith("/")) {
                    path = path.substring(0, path.length() - 1);
                }
                item.put("name", driveDisplayName(root, path));
                item.put("path", path);
                item.put("isDirectory", true);
                item.put("size", 0L);
                item.put("lastModified", root.lastModified());
                drives.add(item);
            }
            return ResponseEntity.ok(drives);
        }
        // A bare drive letter like "C:" (no trailing separator) is NOT the
        // drive's root as far as java.io.File is concerned — Java/Windows
        // interprets it as "the current working directory on that drive",
        // which silently resolves somewhere else entirely. Force it to the
        // true root by appending a separator before resolving.
        String folderPath = Folder.trim();
        if (folderPath.matches("^[A-Za-z]:$")) {
            folderPath = folderPath + File.separator;
        }
        File dir;
        try {
            dir = new File(folderPath).getCanonicalFile();
        } catch (IOException e) {
            return ResponseEntity.badRequest().body("Invalid folder path.");
        }
        if (!dir.exists() || !dir.isDirectory()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("Folder not found: " + Folder);
        }
        File[] entries = dir.listFiles();
        List<Map<String, Object>> items = new ArrayList<>();
        if (entries != null) {
            Arrays.sort(entries, (a, b) -> {
                if (a.isDirectory() != b.isDirectory()) return a.isDirectory() ? -1 : 1;
                return a.getName().compareToIgnoreCase(b.getName());
            });
            for (File entry : entries) {
                Map<String, Object> item = new HashMap<>();
                item.put("name",          entry.getName());
                item.put("path",          entry.getPath().replace("\\", "/"));
                item.put("isDirectory",   entry.isDirectory());
                item.put("size",          entry.isFile() ? entry.length() : 0L);
                item.put("lastModified",  entry.lastModified());
                items.add(item);
            }
        }
        return ResponseEntity.ok(items);
    }

    @GetMapping(path = "/allfiles", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<List<String>> getAllFiles(@RequestParam String Folder) {

        List<String> Files = new ArrayList<>();
        FileHelper configHelper = new FileHelper();
        configHelper.GetFiles(Folder, "");
        Files = configHelper.getFileList();
        if (Files.size() == 0) {
            return new ResponseEntity<List<String>>(Files, HttpStatus.FAILED_DEPENDENCY);
        }

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Listed Folder: " + Folder + " from " + request.getLocalName());
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<List<String>>(Files, HttpStatus.OK);
    }

    @GetMapping(path = "/filecontents", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> getFileContents(@RequestParam String Folder, @RequestParam(required = false, defaultValue = "") String File) {

        String fileContent;
        FileHelper configHelper = new FileHelper();
        String sFilename;
        try {
            File canonicalTargetFile;
            File canonicalFolder;

            if (File == null || File.trim().isEmpty()) {
                if (Folder == null || Folder.trim().isEmpty() || Folder.endsWith("/") || Folder.endsWith("\\")) {
                    return new ResponseEntity<String>("Invalid file path", HttpStatus.BAD_REQUEST);
                }

                canonicalTargetFile = new File(Folder).getCanonicalFile();
                File parentFolder = canonicalTargetFile.getParentFile();
                if (parentFolder == null) {
                    return new ResponseEntity<String>("Invalid file path", HttpStatus.BAD_REQUEST);
                }
                canonicalFolder = parentFolder.getCanonicalFile();
            } else {
                File targetFile = new File(File);
                if (!targetFile.isAbsolute()) {
                    targetFile = new File(Folder, File);
                }

                canonicalTargetFile = targetFile.getCanonicalFile();
                canonicalFolder = new File(Folder).getCanonicalFile();
            }

            if (!isChildOf(canonicalFolder, canonicalTargetFile)) {
                return new ResponseEntity<String>("Invalid file path", HttpStatus.FORBIDDEN);
            }

            sFilename = canonicalTargetFile.getPath();
        } catch (IOException e) {
            return new ResponseEntity<String>("Invalid file path", HttpStatus.BAD_REQUEST);
        }

        fileContent = configHelper.getFileContents(sFilename);
        if (fileContent.length() == 0) {
            return new ResponseEntity<String>(fileContent, HttpStatus.FAILED_DEPENDENCY);
        }

        RequestHelper requestHelper = new RequestHelper(request);
        EventLog auditEvent = new EventLog(request.getRemoteHost(), requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(), "Retrieve contents of " + sFilename);
        messageService.sendMessage(auditEvent);

        return new ResponseEntity<String>(fileContent, HttpStatus.OK);
    }

    @PostMapping(value = "/uploadfile", consumes = "multipart/form-data")
    public ResponseEntity<String> uploadFile(@RequestPart("file") MultipartFile file, @RequestParam("Folder") String Folder) {
        try {
            String safeName = sanitiseFilename(file.getOriginalFilename());
            File targetDir  = canonical(Folder);
            File targetFile = canonical(targetDir.getPath() + File.separator + safeName);
            file.transferTo(targetFile.toPath());

            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(request.getRemoteHost(), rh.getJWT_Token(),
                    rh.GetUserNameFromJWT(), "Uploaded File : " + targetFile.getPath() + " from " + request.getLocalName()));
            return ResponseEntity.ok("Uploaded file : " + targetFile.getPath());
        } catch (IOException e) {
            logger.error("Upload failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Upload failed.");
        } catch (Exception e) {
            logger.error("Upload error", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Unable to upload file.");
        }
    }

    @PostMapping(value = "/renamefile", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> renameFile(@RequestParam String Source, @RequestParam String Target) {
        try {
            File src = canonical(Source);
            File tgt = canonical(Target);
            if (!src.renameTo(tgt)) {
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Rename failed.");
            }
            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(request.getRemoteHost(), rh.getJWT_Token(),
                    rh.GetUserNameFromJWT(), "Renamed file from " + src.getPath() + " to " + tgt.getPath()));
            return ResponseEntity.ok("Renamed file.");
        } catch (IOException e) {
            logger.error("Rename file failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Operation failed.");
        }
    }

    @DeleteMapping(value = "/deletefile")
    public ResponseEntity<String> deleteFile(@RequestParam String Source) {
        try {
            File target = canonical(Source);
            if (target.exists() && target.isFile()) target.delete();
            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(request.getRemoteHost(), rh.getJWT_Token(),
                    rh.GetUserNameFromJWT(), "Deleted file: " + target.getPath()));
            return ResponseEntity.ok("Deleted file.");
        } catch (IOException e) {
            logger.error("Delete file failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Operation failed.");
        }
    }

    private void addDir(List<Map<String, String>> list, String label, String path) {
        Map<String, String> entry = new HashMap<>();
        entry.put("label", label);
        entry.put("path", path != null ? path : "");
        list.add(entry);
    }

    @PostMapping(path = "/createfolder")
    public ResponseEntity<?> createFolder(@RequestParam String SourceFolder) {
        try {
            File target = canonical(SourceFolder);
            new FolderHelper().CreateFolder(target.getPath());
            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(request.getRemoteHost(), rh.getJWT_Token(),
                    rh.GetUserNameFromJWT(), "Created folder: " + target.getPath()));
            return ResponseEntity.ok("Created folder.");
        } catch (IOException e) {
            logger.error("Create folder failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Operation failed.");
        }
    }


    @DeleteMapping(path = "/deletefolder")
    public ResponseEntity<?> deleteFolder(@RequestParam String Folder) {
        try {
            File target = canonical(Folder);
            new FolderHelper().DeleteFolder(target.getPath());
            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(request.getRemoteHost(), rh.getJWT_Token(),
                    rh.GetUserNameFromJWT(), "Deleted folder: " + target.getPath()));
            return ResponseEntity.ok("Deleted folder.");
        } catch (IOException e) {
            logger.error("Delete folder failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Operation failed.");
        }
    }

    @PostMapping(path = "/renamefolder")
    public ResponseEntity<?> renameFolder(@RequestParam String SourceFolder, @RequestParam String TargetFolder) {
        try {
            File src = canonical(SourceFolder);
            File tgt = canonical(TargetFolder);
            new FolderHelper().RenameFolder(src.getPath(), tgt.getPath());
            RequestHelper rh = new RequestHelper(request);
            messageService.sendMessage(new EventLog(request.getRemoteHost(), rh.getJWT_Token(),
                    rh.GetUserNameFromJWT(), "Renamed folder from " + src.getPath() + " to " + tgt.getPath()));
            return ResponseEntity.ok("Renamed folder.");
        } catch (IOException e) {
            logger.error("Rename folder failed", e);
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Operation failed.");
        }
    }

    // -----------------------------------------------------------------------
    // Download a single file as a binary attachment
    // -----------------------------------------------------------------------

    @GetMapping("/downloadfile")
    public ResponseEntity<String> downloadFile(@RequestParam String File, HttpServletResponse response) {
        if (File == null || File.trim().isEmpty()) {
            return ResponseEntity.badRequest().body("File parameter is required.");
        }
        java.io.File target;
        try {
            target = new java.io.File(File).getCanonicalFile();
        } catch (IOException e) {
            return ResponseEntity.badRequest().body("Invalid file path.");
        }
        if (!target.exists() || !target.isFile()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body("File not found: " + File);
        }
        try {
            String mimeType = URLConnection.guessContentTypeFromName(target.getName());
            if (mimeType == null) mimeType = "application/octet-stream";
            response.setContentType(mimeType);
            response.setHeader("Content-Disposition", "attachment; filename=\"" + target.getName() + "\"");
            response.setContentLength((int) target.length());
            try (InputStream in = new BufferedInputStream(new FileInputStream(target))) {
                FileCopyUtils.copy(in, response.getOutputStream());
            }
            RequestHelper requestHelper = new RequestHelper(request);
            EventLog auditEvent = new EventLog(request.getRemoteHost(),
                    requestHelper.getJWT_Token(), requestHelper.GetUserNameFromJWT(),
                    "Downloaded file: " + target.getName());
            messageService.sendMessage(auditEvent);
            return null; // response already fully streamed to HttpServletResponse
        } catch (IOException e) {
            logger.error("Failed to stream file: {}", File, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body("Failed to download file.");
        }
    }
}
