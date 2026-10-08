package com.remex.RemExService.helpers;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.FilenameFilter;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class FileHelper {
    private static final Logger logger = LoggerFactory.getLogger(FileHelper.class);

    private List<String> fileList = new ArrayList<>();

    public FileHelper() {
    }

    public List<String> getFileList() {
        return fileList;
    }

    public void setConfigFiles(List<String> fileList) {
        this.fileList = fileList;
    }

    public void GetFiles(String sFolder, String sExtension) {

        if (sFolder == null || sFolder.trim().isEmpty()) {
            return;
        }
        final String extension = sExtension == null ? "" : sExtension.toLowerCase();

        File f = new File(sFolder);

        FilenameFilter textFilter = new FilenameFilter() {
            public boolean accept(File dir, String name) {
                return name.toLowerCase().endsWith(extension);
            }
        };

        File[] files = f.listFiles(textFilter);
        if (files == null) {
            return;
        }
        for (File file : files) {
            if (file.isFile()) {
                this.fileList.add(sFolder + "/" + file.getName());
            }
        }
    }

    public int GetFilesCount(String sFolder, String sExtension) {

        int dFileCount = 0;
        if (sFolder == null || sFolder.trim().isEmpty()) {
            return dFileCount;
        }
        final String extension = sExtension == null ? "" : sExtension.toLowerCase();

        File f = new File(sFolder);

        FilenameFilter textFilter = new FilenameFilter() {
            public boolean accept(File dir, String name) {
                return name.toLowerCase().endsWith(extension);
            }
        };

        File[] files = f.listFiles(textFilter);
        if (files == null) {
            return dFileCount;
        }
        for (File file : files) {
            if (file.isFile()) {
                dFileCount++;
            }
        }

        return dFileCount;
    }

    public String getFileContents(String fileName) {

        try {
            return new String(Files.readAllBytes(Paths.get(fileName)));
        } catch (IOException e) {
            logger.error("Failed to read file contents: {}", fileName, e);
            return null;
        }
    }

    public boolean updateFileContents(String sFileName, String sContent) {

        boolean bSuccess = false;
        try {
            Files.write(Paths.get(sFileName), sContent.getBytes());
            bSuccess = true;
        } catch (IOException e) {
            bSuccess = false;
        }
        return bSuccess;
    }
}
