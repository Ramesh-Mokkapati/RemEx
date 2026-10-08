package com.remex.RemExService.helpers;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry;
import org.apache.commons.compress.archivers.zip.ZipArchiveInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * ZipHelper — extraction and compression utilities.
 *
 * <h2>Supported zip layouts for {@link #UnZip}</h2>
 * <ol>
 *   <li><b>Flat</b> – files appear directly at the root of the archive:
 *       <pre>rmxutil.exe
 * RMX/config.cfg</pre>
 *       These are extracted straight into {@code sDestinationFolder}.
 *   </li>
 *   <li><b>Wrapped</b> – all entries share a single top-level directory
 *       (common when a folder is zipped rather than its contents):
 *       <pre>CDIMAGE_ZIPS_64_7.0.0.1/rmxutil.exe
 * CDIMAGE_ZIPS_64_7.0.0.1/RMX/config.cfg</pre>
 *       The wrapper directory is automatically stripped so files land in
 *       {@code sDestinationFolder} just as the flat layout would.
 *   </li>
 * </ol>
 *
 * <p>Both layouts are detected automatically via a first-pass scan; the caller
 * does not need to know which format the archive uses.</p>
 *
 * <p>Zip-Slip protection is retained: any entry whose resolved canonical path
 * falls outside {@code sDestinationFolder} causes an {@link IOException}.</p>
 */
public class ZipHelper {

    private static final Logger log = LoggerFactory.getLogger(ZipHelper.class);
    private static final int BUFFER_SIZE = 8192;

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Extracts {@code sZipName} into {@code sDestinationFolder}, automatically
     * handling both flat and single-wrapper zip layouts.
     *
     * <p>Uses {@link ZipFile} (random-access, central-directory based) rather than
     * {@link ZipInputStream} (sequential, local-header based). This matters because
     * some ZIP tools embed a spurious End-of-Central-Directory record early in the
     * file (e.g. as a wrapper stub), causing {@code ZipInputStream} to stop after
     * the first entry. {@code ZipFile} always seeks to the <em>real</em> EOCD at
     * the physical end of the file and reads the authoritative central directory from
     * there, so all entries are visible regardless of any earlier EOCD.</p>
     *
     * @return list of absolute paths of every file written to disk (directories excluded)
     */
    public List<String> UnZip(String sZipName, String sDestinationFolder) throws IOException {

        List<String> extractedFiles = new ArrayList<>();
        File destDir = new File(sDestinationFolder);

        // Pass 1 — detect whether every entry shares one top-level prefix.
        String prefix = detectTopLevelPrefix(sZipName);

        // Pass 2 — extract using ZipFile (central-directory based, random access).
        byte[] buffer = new byte[BUFFER_SIZE];
        try (ZipFile zipFile = new ZipFile(sZipName)) {
            Enumeration<? extends ZipEntry> entries = zipFile.entries();
            while (entries.hasMoreElements()) {
                ZipEntry zipEntry = entries.nextElement();
                String entryName = normaliseEntryName(zipEntry.getName(), prefix);

                // Skip the wrapper directory entry itself (now empty after stripping).
                if (entryName.isEmpty()) {
                    continue;
                }

                File newFile = safeFile(destDir, entryName);

                if (zipEntry.isDirectory()) {
                    if (!newFile.isDirectory() && !newFile.mkdirs()) {
                        throw new IOException("Failed to create directory " + newFile);
                    }
                } else {
                    File parent = newFile.getParentFile();
                    if (!parent.isDirectory() && !parent.mkdirs()) {
                        throw new IOException("Failed to create directory " + parent);
                    }
                    try (InputStream is = zipFile.getInputStream(zipEntry);
                         FileOutputStream fos = new FileOutputStream(newFile)) {
                        int len;
                        while ((len = is.read(buffer)) > 0) {
                            fos.write(buffer, 0, len);
                        }
                    }
                    extractedFiles.add(newFile.getAbsolutePath());
                }
            }
        }

        return extractedFiles;
    }

    /**
     * Extracts a ZIP archive from {@code filePath} starting at {@code startOffset} bytes,
     * using {@link ZipInputStream} (sequential, local-header based).
     *
     * <p>Unlike {@link #UnZip} this method does <em>not</em> rely on the central directory,
     * making it suitable for archives whose central-directory offsets are relative to a
     * different base (e.g. a concatenated / prefixed archive where the outer wrapper has been
     * identified but not physically removed).</p>
     *
     * <p>Single-wrapper prefix stripping and Zip-Slip protection are applied in the same way
     * as {@link #UnZip}.</p>
     *
     * @param filePath            path to the file containing the ZIP data
     * @param startOffset         number of bytes to skip before the first local file header
     * @param sDestinationFolder  directory into which entries are extracted
     * @return list of absolute paths of every file written to disk (directories excluded)
     */
    public List<String> UnZipStream(String filePath, long startOffset, String sDestinationFolder) throws IOException {

        // Pass 1 — detect wrapper prefix by scanning entry names.
        String prefix = detectTopLevelPrefixStream(filePath, startOffset);

        // Pass 2 — extract.
        List<String> extractedFiles = new ArrayList<>();
        File destDir = new File(sDestinationFolder);
        byte[] buffer = new byte[BUFFER_SIZE];

        try (FileInputStream fis = new FileInputStream(filePath)) {
            skipFully(fis, startOffset);
            try (ZipInputStream zis = new ZipInputStream(fis)) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    String entryName = normaliseEntryName(entry.getName(), prefix);
                    if (!entryName.isEmpty()) {
                        File newFile = safeFile(destDir, entryName);
                        if (entry.isDirectory()) {
                            if (!newFile.isDirectory() && !newFile.mkdirs()) {
                                throw new IOException("Failed to create directory " + newFile);
                            }
                        } else {
                            File parent = newFile.getParentFile();
                            if (!parent.isDirectory() && !parent.mkdirs()) {
                                throw new IOException("Failed to create directory " + parent);
                            }
                            try (FileOutputStream fos = new FileOutputStream(newFile)) {
                                int len;
                                while ((len = zis.read(buffer)) > 0) fos.write(buffer, 0, len);
                            }
                            extractedFiles.add(newFile.getAbsolutePath());
                        }
                    }
                    try {
                        zis.closeEntry();
                    } catch (IOException e) {
                        // Cannot drain remaining compressed data (e.g. Deflate64 / corrupt stream).
                        // The current entry's data was already written; break so the caller can
                        // judge whether enough files were extracted rather than losing everything.
                        log.warn("UnZipStream: closeEntry() failed for '{}': {}", entry.getName(), e.getMessage());
                        break;
                    }
                }
            }
        }

        return extractedFiles;
    }

    // -----------------------------------------------------------------------
    // Layout detection
    // -----------------------------------------------------------------------

    /**
     * Fast prefix detection: reads <em>only</em> the first entry's local header
     * (no entry data is drained) using {@link ZipArchiveInputStream}.
     *
     * <p>Returns the top-level directory component (e.g. {@code "RMX_0.0.6.17/"}) when
     * the first entry is a wrapper directory, or {@code ""} for flat archives.  Because
     * only the first header is read the stream is closed immediately after — no
     * decompression occurs — so this method is safe to call even on very large files.</p>
     */
    private String detectTopLevelPrefixFast(String filePath, long startOffset) {
        try (FileInputStream fis = new FileInputStream(filePath)) {
            skipFully(fis, startOffset);
            try (ZipArchiveInputStream zais = new ZipArchiveInputStream(fis, "UTF-8", true, true)) {
                ZipArchiveEntry first = zais.getNextZipEntry();
                if (first == null) return "";
                String name = first.getName().replace('\\', '/');
                if (name.startsWith("./")) name = name.substring(2);
                if (name.isEmpty()) return "";
                int slashIdx = name.indexOf('/');
                // Root-level file → flat archive, no wrapper to strip.
                if (!first.isDirectory() && slashIdx < 0) return "";
                // Return the top-level directory component including its trailing slash.
                return slashIdx >= 0 ? name.substring(0, slashIdx + 1) : name + "/";
            }
        } catch (IOException e) {
            log.warn("detectTopLevelPrefixFast: could not read first entry header: {}", e.getMessage());
            return "";
        }
    }

    /**
     * Extracts a ZIP archive from {@code filePath} starting at {@code startOffset} bytes,
     * using Apache Commons Compress {@link ZipArchiveInputStream}.
     *
     * <p>Unlike the JDK {@link ZipInputStream}, Commons Compress natively handles
     * <b>Deflate64</b> (method&nbsp;9), <b>ZIP64</b> extensions, and other ZIP dialect
     * variants that the JDK rejects with {@code invalid code lengths set} or similar
     * decompression errors.</p>
     *
     * <p>{@link ZipArchiveInputStream#canReadEntryData} is checked before attempting to
     * read each entry's content; entries with unsupported compression methods are logged
     * and skipped rather than causing an exception.</p>
     *
     * <p>Single-wrapper prefix stripping ({@link #detectTopLevelPrefixFast}) and
     * Zip-Slip protection ({@link #safeFile}) are applied in the same way as the other
     * extraction methods.</p>
     *
     * @param filePath            path to the file containing the ZIP data
     * @param startOffset         number of bytes to skip before the first local file header
     * @param sDestinationFolder  directory into which entries are extracted
     * @return list of absolute paths of every file written to disk (directories excluded)
     */
    public List<String> UnZipApacheCompress(String filePath, long startOffset, String sDestinationFolder)
            throws IOException {

        // Pass 1 — fast prefix detection (reads only the first entry header, no data drained).
        String prefix = detectTopLevelPrefixFast(filePath, startOffset);

        // Pass 2 — extract using ZipArchiveInputStream (supports Deflate64 / ZIP64).
        List<String> extractedFiles = new ArrayList<>();
        File destDir = new File(sDestinationFolder);
        byte[] buffer = new byte[BUFFER_SIZE];

        try (FileInputStream fis = new FileInputStream(filePath)) {
            skipFully(fis, startOffset);
            try (ZipArchiveInputStream zais = new ZipArchiveInputStream(fis, "UTF-8", true, true)) {
                ZipArchiveEntry entry;
                while ((entry = zais.getNextZipEntry()) != null) {
                    String entryName = normaliseEntryName(entry.getName(), prefix);
                    if (entryName.isEmpty()) continue;

                    File newFile = safeFile(destDir, entryName);

                    if (entry.isDirectory()) {
                        if (!newFile.isDirectory() && !newFile.mkdirs()) {
                            throw new IOException("Failed to create directory " + newFile);
                        }
                    } else if (zais.canReadEntryData(entry)) {
                        File parent = newFile.getParentFile();
                        if (!parent.isDirectory() && !parent.mkdirs()) {
                            throw new IOException("Failed to create directory " + parent);
                        }
                        try (FileOutputStream fos = new FileOutputStream(newFile)) {
                            int len;
                            while ((len = zais.read(buffer)) > 0) fos.write(buffer, 0, len);
                        }
                        extractedFiles.add(newFile.getAbsolutePath());
                    } else {
                        log.warn("UnZipApacheCompress: skipping '{}' — unsupported compression method {}",
                                entry.getName(), entry.getMethod());
                    }
                }
            }
        }

        return extractedFiles;
    }

    /**
     * Prefix detection for a sequential (ZipInputStream) read starting at {@code startOffset}.
     * Mirrors the logic of {@link #detectTopLevelPrefix} without requiring random access.
     *
     * <p>If draining a compressed entry throws a {@link java.io.IOException} (e.g.
     * {@code invalid code lengths set} for a corrupt or Deflate64-compressed entry), the
     * exception is swallowed and the method returns {@code ""} so that the caller can still
     * attempt extraction without wrapper-prefix stripping rather than aborting entirely.</p>
     */
    private String detectTopLevelPrefixStream(String filePath, long startOffset) throws IOException {
        String commonPrefix = null;
        try (FileInputStream fis = new FileInputStream(filePath)) {
            skipFully(fis, startOffset);
            try (ZipInputStream zis = new ZipInputStream(fis)) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    String name = entry.getName().replace('\\', '/');
                    if (name.startsWith("./")) name = name.substring(2);
                    if (!name.isEmpty()) {
                        int slashIdx = name.indexOf('/');
                        if (!entry.isDirectory() && slashIdx < 0) {
                            try { zis.closeEntry(); } catch (IOException ignored) { }
                            return "";
                        }
                        String pfx = slashIdx >= 0 ? name.substring(0, slashIdx + 1) : name + "/";
                        if (commonPrefix == null) {
                            commonPrefix = pfx;
                        } else if (!commonPrefix.equals(pfx)) {
                            try { zis.closeEntry(); } catch (IOException ignored) { }
                            return "";
                        }
                    }
                    try {
                        zis.closeEntry();
                    } catch (IOException e) {
                        // Cannot drain this entry's compressed data (corrupt stream or
                        // unsupported compression). Prefix detection is inconclusive —
                        // return "" so extraction is still attempted without stripping.
                        return "";
                    }
                }
            }
        }
        return commonPrefix != null ? commonPrefix : "";
    }

    private static void skipFully(InputStream in, long bytes) throws IOException {
        long remaining = bytes;
        while (remaining > 0) {
            long skipped = in.skip(remaining);
            if (skipped <= 0) break;
            remaining -= skipped;
        }
    }

    /**
     * Scans every entry in the zip to determine whether all of them share a
     * single top-level directory prefix (the "wrapped" layout).
     *
     * <p>Uses {@link ZipFile} so the full central directory is visible — the same
     * reason {@link #UnZip} uses it (see that method's javadoc).</p>
     *
     * @return the common prefix including its trailing {@code /}
     *         (e.g. {@code "CDIMAGE_ZIPS_64_7.0.0.1/"}), or {@code ""}
     *         if the archive is flat or has mixed top-level entries.
     */
    String detectTopLevelPrefix(String sZipName) throws IOException {
        String commonPrefix = null;

        try (ZipFile zipFile = new ZipFile(sZipName)) {
            Enumeration<? extends ZipEntry> entries = zipFile.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();

                // Normalise: use forward slashes, strip leading "./"
                String name = entry.getName().replace('\\', '/');
                if (name.startsWith("./")) {
                    name = name.substring(2);
                }

                // An empty name after normalisation (e.g. the root "." entry) — skip.
                if (name.isEmpty()) {
                    continue;
                }

                int slashIdx = name.indexOf('/');

                // A file at the root of the archive → no wrapper possible.
                if (!entry.isDirectory() && slashIdx < 0) {
                    return "";
                }

                // The top-level component (up to and including the first slash).
                String prefix = slashIdx >= 0 ? name.substring(0, slashIdx + 1) : name + "/";

                if (commonPrefix == null) {
                    commonPrefix = prefix;
                } else if (!commonPrefix.equals(prefix)) {
                    // Two different top-level entries — not a single wrapper.
                    return "";
                }
            }
        }

        return commonPrefix != null ? commonPrefix : "";
    }

    /**
     * Normalises a raw zip entry name:
     * <ol>
     *   <li>Converts backslashes to forward slashes.</li>
     *   <li>Strips a leading {@code ./}.</li>
     *   <li>Strips the detected wrapper {@code prefix}.</li>
     * </ol>
     */
    String normaliseEntryName(String rawName, String prefix) {
        String name = rawName.replace('\\', '/');
        if (name.startsWith("./")) {
            name = name.substring(2);
        }
        if (!prefix.isEmpty() && name.startsWith(prefix)) {
            name = name.substring(prefix.length());
        }
        return name;
    }

    // -----------------------------------------------------------------------
    // Zip-Slip guard
    // -----------------------------------------------------------------------

    /**
     * Resolves {@code entryName} relative to {@code destinationDir} and verifies
     * that the result is still inside that directory (Zip-Slip protection).
     */
    private File safeFile(File destinationDir, String entryName) throws IOException {
        File destFile = new File(destinationDir, entryName);
        String destDirPath  = destinationDir.getCanonicalPath();
        String destFilePath = destFile.getCanonicalPath();

        if (!destFilePath.startsWith(destDirPath + File.separator)) {
            throw new IOException("Entry is outside of the target dir: " + entryName);
        }

        return destFile;
    }

    // -----------------------------------------------------------------------
    // Compression helpers (unchanged)
    // -----------------------------------------------------------------------

    public void ZipFile(String sourceFile, String zipName) throws IOException {

        FileOutputStream fos = new FileOutputStream(zipName);
        ZipOutputStream zipOut = new ZipOutputStream(fos);
        File fileToZip = new File(sourceFile);
        FileInputStream fis = new FileInputStream(fileToZip);
        ZipEntry zipEntry = new ZipEntry(fileToZip.getName());
        zipOut.putNextEntry(zipEntry);
        byte[] bytes = new byte[1024];
        int length;

        while ((length = fis.read(bytes)) >= 0) {
            zipOut.write(bytes, 0, length);
        }

        zipOut.close();
        fis.close();
        fos.close();
    }

    public void ZipMultipleFiles(List<String> sourceFiles, String DestinationFile) throws IOException {

        FileOutputStream fos = new FileOutputStream(DestinationFile);
        ZipOutputStream zipOut = new ZipOutputStream(fos);

        for (String srcFile : sourceFiles) {
            File fileToZip = new File(srcFile);
            FileInputStream fis = new FileInputStream(fileToZip);
            ZipEntry zipEntry = new ZipEntry(fileToZip.getName());
            zipOut.putNextEntry(zipEntry);

            byte[] bytes = new byte[1024];
            int length;

            while ((length = fis.read(bytes)) >= 0) {
                zipOut.write(bytes, 0, length);
            }

            fis.close();
        }

        zipOut.close();
        fos.close();
    }

    public void ZipFolder(String sourcDirPath, String zipPath) throws IOException {

        Path zipFile = Files.createFile(Paths.get(zipPath));

        Path sourceDirPath = Paths.get(sourcDirPath);
        try (ZipOutputStream zipOutputStream = new ZipOutputStream(Files.newOutputStream(zipFile));
             Stream<Path> paths = Files.walk(sourceDirPath)) {
            paths
                    .filter(path -> !Files.isDirectory(path))
                    .forEach(path -> {
                        ZipEntry zipEntry = new ZipEntry(sourceDirPath.relativize(path).toString());
                        try {
                            zipOutputStream.putNextEntry(zipEntry);
                            Files.copy(path, zipOutputStream);
                            zipOutputStream.closeEntry();
                        } catch (IOException e) {
                            System.err.println(e);
                        }
                    });
        }
    }
}