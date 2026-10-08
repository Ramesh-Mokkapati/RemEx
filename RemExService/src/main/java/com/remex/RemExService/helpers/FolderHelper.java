package com.remex.RemExService.helpers;

import java.io.File;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.ArrayList;
import java.util.List;

public class FolderHelper {

    public FolderHelper() {
    }

    public void RenameFolder(String sourceDir, String targetDir) {

        File dir = new File(sourceDir);
        if (dir.isDirectory()) {
            File newDir = new File(targetDir);
            dir.renameTo(newDir);
        }
    }

    public void CreateFolder(String sourceFolder) {

        File theDir = new File(sourceFolder);
        if (!theDir.exists()) {
            theDir.mkdirs();
        }
    }

    public void DeleteFolder(String directoryFilePath) throws IOException {

        Path directory = Paths.get(directoryFilePath);

        if (Files.exists(directory)) {
            Files.walkFileTree(directory, new SimpleFileVisitor<Path>() {
                @Override
                public FileVisitResult visitFile(Path path, BasicFileAttributes basicFileAttributes) throws IOException {
                    Files.delete(path);
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult postVisitDirectory(Path directory, IOException ioException) throws IOException {
                    Files.delete(directory);
                    return FileVisitResult.CONTINUE;
                }
            });
        }
    }
}
