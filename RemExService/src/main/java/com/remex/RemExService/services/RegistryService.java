package com.remex.RemExService.services;

import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.charset.Charset;
import java.util.*;

@Service
public class RegistryService {

    // IBM437 is the OEM code page used by reg.exe on Western Windows systems.
    // Falling back to the platform default keeps it working on other locales.
    private static final Charset REG_CHARSET;
    static {
        Charset cs;
        try {
            cs = Charset.forName("IBM437");
        } catch (Exception e) {
            cs = Charset.defaultCharset();
        }
        REG_CHARSET = cs;
    }

    private static final String[] HIVES = {
        "HKEY_LOCAL_MACHINE",
        "HKEY_CURRENT_USER",
        "HKEY_CLASSES_ROOT",
        "HKEY_USERS",
        "HKEY_CURRENT_CONFIG"
    };

    public List<String> getHives() {
        return Arrays.asList(HIVES);
    }

    public List<RegistryKey> listKeys(String hive, String path) throws Exception {
        List<RegistryKey> keys = new ArrayList<>();
        try {
            String regPath = hive + (path != null && !path.isEmpty() ? "\\" + path : "");
            ProcessBuilder pb = new ProcessBuilder("reg", "query", regPath);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), REG_CHARSET));
            String line;
            while ((line = reader.readLine()) != null) {
                String keyPath = line.trim();
                // Only direct sub-key lines start with regPath + "\\"
                if (keyPath.startsWith(regPath + "\\")) {
                    String keyName = keyPath.substring(keyPath.lastIndexOf('\\') + 1);
                    keys.add(new RegistryKey(keyName, keyPath));
                }
            }
            process.waitFor();
        } catch (Exception e) {
            throw new Exception("Failed to list registry keys: " + e.getMessage());
        }
        return keys;
    }

    public List<RegistryValue> getValues(String keyPath) throws Exception {
        List<RegistryValue> values = new ArrayList<>();
        try {
            // "reg query <path> /v *" is invalid — plain "reg query <path>" lists
            // all values under the key along with its sub-keys.
            ProcessBuilder pb = new ProcessBuilder("reg", "query", keyPath);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), REG_CHARSET));
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.contains("REG_")) {
                    RegistryValue value = parseRegistryValue(line);
                    if (value != null) {
                        values.add(value);
                    }
                }
            }
            process.waitFor();
        } catch (Exception e) {
            throw new Exception("Failed to get registry values: " + e.getMessage());
        }
        return values;
    }

    public boolean createKey(String keyPath) throws Exception {
        try {
            ProcessBuilder pb = new ProcessBuilder("reg", "add", keyPath, "/f");
            Process process = pb.start();
            process.waitFor();
            return process.exitValue() == 0;
        } catch (Exception e) {
            throw new Exception("Failed to create registry key: " + e.getMessage());
        }
    }

    public boolean deleteKey(String keyPath) throws Exception {
        try {
            ProcessBuilder pb = new ProcessBuilder("reg", "delete", keyPath, "/f");
            Process process = pb.start();
            process.waitFor();
            return process.exitValue() == 0;
        } catch (Exception e) {
            throw new Exception("Failed to delete registry key: " + e.getMessage());
        }
    }

    public boolean setValue(String keyPath, String valueName, String valueType, String value, boolean defaultValue) throws Exception {
        try {
            List<String> command = new ArrayList<>(Arrays.asList("reg", "add", keyPath));
            if (defaultValue) {
                command.add("/ve");
            } else {
                command.add("/v");
                command.add(valueName);
            }
            command.addAll(Arrays.asList("/t", valueType, "/d", value, "/f"));
            ProcessBuilder pb = new ProcessBuilder(command);
            Process process = pb.start();
            process.waitFor();
            return process.exitValue() == 0;
        } catch (Exception e) {
            throw new Exception("Failed to set registry value: " + e.getMessage());
        }
    }

    public boolean deleteValue(String keyPath, String valueName, boolean defaultValue) throws Exception {
        try {
            List<String> command = new ArrayList<>(Arrays.asList("reg", "delete", keyPath));
            if (defaultValue) {
                command.add("/ve");
            } else {
                command.add("/v");
                command.add(valueName);
            }
            command.add("/f");
            ProcessBuilder pb = new ProcessBuilder(command);
            Process process = pb.start();
            process.waitFor();
            return process.exitValue() == 0;
        } catch (Exception e) {
            throw new Exception("Failed to delete registry value: " + e.getMessage());
        }
    }

    public List<RegistrySearchResult> search(String hive, String searchTerm, boolean searchKeys,
            boolean searchValues, boolean searchData, boolean wholeMatch, boolean subtree) throws Exception {
        // Run a single unified "reg query /f" search. The /k, /v, /d flags are NOT
        // valid search-scope flags for "reg query /f" on standard Windows.
        // We do one pass and classify each result line ourselves.
        Map<String, RegistrySearchResult> results = new LinkedHashMap<>();
        try {
            List<String> command = new ArrayList<>(Arrays.asList("reg", "query", hive, "/f", searchTerm));
            if (subtree) {
                command.add("/s");
            }
            if (wholeMatch) {
                command.add("/e");
            }

            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);
            Process process = pb.start();

            BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), REG_CHARSET));
            String line;
            String currentKeyPath = "";
            while ((line = reader.readLine()) != null) {
                String trimmed = line.trim();
                if (trimmed.isEmpty()) continue;

                if (trimmed.startsWith("HKEY")) {
                    currentKeyPath = trimmed;
                    if (searchKeys && keyNameContains(trimmed, searchTerm, wholeMatch)) {
                        addSearchResult(results, trimmed, "", "Key");
                    }
                } else if (!currentKeyPath.isEmpty() && trimmed.contains("REG_")) {
                    String[] parts = trimmed.split("\\s{2,}|\\t", 3);
                    String valueName = parts.length > 0 ? parts[0].trim() : "";
                    String valueData = parts.length > 2 ? parts[2].trim() : "";

                    boolean nameMatches = containsIgnoreCase(valueName, searchTerm, wholeMatch);
                    boolean dataMatches = containsIgnoreCase(valueData, searchTerm, wholeMatch);

                    if (searchValues && nameMatches) {
                        addSearchResult(results, currentKeyPath, trimmed, "Value");
                    } else if (searchData && dataMatches) {
                        addSearchResult(results, currentKeyPath, trimmed, "Data");
                    } else if (searchValues || searchData) {
                        String matchType = nameMatches ? "Value" : "Data";
                        addSearchResult(results, currentKeyPath, trimmed, matchType);
                    }
                }
            }
            process.waitFor();
        } catch (Exception e) {
            throw new Exception("Failed to search registry: " + e.getMessage());
        }
        return new ArrayList<>(results.values());
    }

    private boolean keyNameContains(String keyPath, String searchTerm, boolean wholeMatch) {
        String keyName = keyPath.contains("\\")
            ? keyPath.substring(keyPath.lastIndexOf('\\') + 1)
            : keyPath;
        return containsIgnoreCase(keyName, searchTerm, wholeMatch);
    }

    private boolean containsIgnoreCase(String text, String term, boolean wholeMatch) {
        if (text == null || term == null) return false;
        String lText = text.toLowerCase(Locale.ROOT);
        String lTerm = term.toLowerCase(Locale.ROOT);
        return wholeMatch ? lText.equals(lTerm) : lText.contains(lTerm);
    }

    private void addSearchResult(Map<String, RegistrySearchResult> results, String keyPath, String entry,
            String matchType) {
        String resultKey = keyPath + "\n" + entry + "\n" + matchType;
        if (!results.containsKey(resultKey)) {
            RegistrySearchResult result = new RegistrySearchResult();
            result.setKeyPath(keyPath);
            result.setEntry(entry);
            result.setMatchType(matchType);
            results.put(resultKey, result);
        }
    }

    public byte[] exportReg(String keyPath) throws Exception {
        try {
            File tempFile = File.createTempFile("registry_export", ".reg");
            ProcessBuilder pb = new ProcessBuilder("reg", "export", keyPath, tempFile.getAbsolutePath(), "/y");
            Process process = pb.start();
            process.waitFor();

            if (process.exitValue() == 0) {
                FileInputStream fis = new FileInputStream(tempFile);
                byte[] data = new byte[(int) tempFile.length()];
                fis.read(data);
                fis.close();
                tempFile.delete();
                return data;
            }
            tempFile.delete();
            throw new Exception("Export failed");
        } catch (Exception e) {
            throw new Exception("Failed to export registry: " + e.getMessage());
        }
    }

    public boolean importReg(InputStream fileInputStream) throws Exception {
        try {
            File tempFile = File.createTempFile("registry_import", ".reg");
            FileOutputStream fos = new FileOutputStream(tempFile);
            byte[] buffer = new byte[1024];
            int length;
            while ((length = fileInputStream.read(buffer)) > 0) {
                fos.write(buffer, 0, length);
            }
            fos.close();

            ProcessBuilder pb = new ProcessBuilder("reg", "import", tempFile.getAbsolutePath());
            Process process = pb.start();
            process.waitFor();

            tempFile.delete();
            return process.exitValue() == 0;
        } catch (Exception e) {
            throw new Exception("Failed to import registry: " + e.getMessage());
        }
    }

    private RegistryValue parseRegistryValue(String line) {
        try {
            // reg.exe separates columns with 4 spaces or tabs; split on 2+ spaces or tab
            String[] parts = line.trim().split("\\s{2,}|\\t", 3);
            if (parts.length >= 3) {
                return new RegistryValue(parts[0].trim(), parts[1].trim(), parts[2].trim());
            }
        } catch (Exception e) {
            // Skip malformed lines
        }
        return null;
    }

    public static class RegistryKey {
        public String name;
        public String path;

        public RegistryKey(String name, String path) {
            this.name = name;
            this.path = path;
        }
    }

    public static class RegistryValue {
        public String name;
        public String type;
        public String data;

        public RegistryValue(String name, String type, String data) {
            this.name = name;
            this.type = type;
            this.data = data;
        }
    }

    public static class RegistrySearchResult {
        public String keyPath;
        public String entry;
        public String matchType;

        public String getKeyPath() { return keyPath; }
        public void setKeyPath(String keyPath) { this.keyPath = keyPath; }

        public String getEntry() { return entry; }
        public void setEntry(String entry) { this.entry = entry; }

        public String getMatchType() { return matchType; }
        public void setMatchType(String matchType) { this.matchType = matchType; }
    }
}
