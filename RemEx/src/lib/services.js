/**
 * Catalogue of RMX-NG microservices exposed in RemEx.
 *
 * This build only surfaces the Remote Server Management Service — every
 * other RMX-NG microservice has been removed from this prototype.
 *
 * AUTO-GENERATED: this file's `endpoints` array is derived directly from
 * the @*Mapping / @RequestParam annotations of the Spring controller in
 * RemExService (see /tmp/extract_endpoints.py in the
 * repo history). Re-run that script if you add controllers.
 *
 * Field reference for each service:
 *   slug      — URL slug used by /services/[slug]
 *   code      — short code referenced by the Spring service (RootController)
 *   name      — long human-readable name
 *   icon      — Metro UI icon class (mif-*) used by the ribbon
 *   port      — default localhost port (overridable via env)
 *   envKey    — env-var name suffix consumed by apiClient
 *   group     — ribbon tab key (home | operations)
 *   base      — REST controller base path
 *   endpoints — array of {label, method, path, params?, body?}
 */

import { readRuntimeEnv } from "./runtimeEnv";

const port = (envKey, fallback) => Number(readRuntimeEnv(envKey, String(fallback)));

export const services = [
  {
    slug: "remote-server",
    code: "RemExService",
    name: "Remote Server (RemExService)",
    summary: "System info, file/folder management, processes and remote commands.",
    icon: "mif-server",
    port: port("RMX_RSMS_PORT", 9014),
    envKey: "RSMS",
    group: "operations",
    base: "/v1/rmxrsms",
    endpoints: [
    { label: "allalertcount", method: "GET", path: "/allalertcount" },
    { label: "executecommand", method: "POST", path: "/executecommand", params: { "Command": "" } },
    { label: "listdirectory", method: "GET", path: "/listdirectory", params: { "Folder": "" } },
    { label: "allfiles", method: "GET", path: "/allfiles", params: { "Folder": "" } },
    { label: "allalertfiles", method: "GET", path: "/allalertfiles" },
    { label: "filecontents", method: "GET", path: "/filecontents", params: { "Folder": "", "File": "" } },
    { label: "uploadfile", method: "POST", path: "/uploadfile", params: { "Folder": "" } },
    { label: "renamefile", method: "POST", path: "/renamefile", params: { "Source": "", "Target": "" } },
    { label: "deletefile", method: "DELETE", path: "/deletefile", params: { "Source": "" } },
    { label: "downloadfile", method: "GET", path: "/downloadfile", params: { "File": "" } },
    { label: "downloadfolder", method: "GET", path: "/downloadfolder", params: { "Folder": "" } },
    { label: "allrmxfolders", method: "GET", path: "/allrmxfolders" },
    { label: "rmxdatafolders", method: "GET", path: "/rmxdatafolders" },
    { label: "rmxemcdirs", method: "GET", path: "/rmxemcdirs" },
    { label: "vrecmetadata", method: "GET", path: "/vrecmetadata", params: { "Folder": "", "VrecName": "", "MaxRecords": "512" } },
    { label: "vrecimage", method: "GET", path: "/vrecimage", params: { "Folder": "", "VrecName": "", "ImageIndex": "1" } },
    { label: "vrecthumbnail", method: "GET", path: "/vrecthumbnail", params: { "Folder": "", "VrecName": "" } },
    { label: "vrecthumbnail/save", method: "PUT", path: "/vrecthumbnail", params: { "Folder": "", "VrecName": "" } },
    { label: "movevrec", method: "PUT", path: "/movevrec", params: { "VrecName": "", "SourceFolder": "", "DestFolder": "", "OperatorId": "" } },
    { label: "createfolder", method: "POST", path: "/createfolder", params: { "SourceFolder": "" } },
    { label: "deletefolder", method: "DELETE", path: "/deletefolder", params: { "Folder": "" } },
    { label: "renamefolder", method: "POST", path: "/renamefolder", params: { "SourceFolder": "", "TargetFolder": "" } },
    { label: "list-tasks", method: "GET", path: "/listtasks" },
    { label: "create-task", method: "POST", path: "/createtask", body: { "TaskName": "", "Folder": "", "Command": "", "Arguments": "", "WorkingDirectory": "", "ScheduleType": "ONCE", "StartDate": "", "StartTime": "", "RunAsUser": "SYSTEM", "RunAsPassword": "" } },
    { label: "modify-task", method: "PUT", path: "/modifytask", body: { "TaskName": "", "Folder": "", "NewTaskName": "", "Command": "", "Arguments": "", "WorkingDirectory": "", "ScheduleType": "ONCE", "StartDate": "", "StartTime": "", "RunAsUser": "SYSTEM", "RunAsPassword": "" } },
    { label: "delete-task", method: "DELETE", path: "/deletetask", params: { "TaskName": "", "Folder": "" } },
    { label: "list-task-folders", method: "GET", path: "/listtaskfolders" },
    { label: "create-task-folder", method: "POST", path: "/createtaskfolder", params: { "Folder": "" } },
    { label: "rename-task-folder", method: "PUT", path: "/renametaskfolder", params: { "Folder": "", "NewFolder": "" } },
    { label: "delete-task-folder", method: "DELETE", path: "/deletetaskfolder", params: { "Folder": "" } },
    { label: "list-envvars", method: "GET", path: "/envvars", params: { "Scope": "Process" } },
    { label: "set-envvar", method: "POST", path: "/envvars", params: { "Name": "", "Value": "", "Scope": "User" } },
    { label: "delete-envvar", method: "DELETE", path: "/envvars", params: { "Name": "", "Scope": "User" } },
    { label: "list-startupapps", method: "GET", path: "/startupapps", params: { "Scope": "User" } },
    { label: "add-startupapp", method: "POST", path: "/startupapps", params: { "Name": "", "Command": "", "Scope": "User" } },
    { label: "delete-startupapp", method: "DELETE", path: "/startupapps", params: { "Name": "", "Scope": "User" } },
    { label: "toggle-startupapp", method: "PUT", path: "/startupapps", params: { "Name": "", "Enabled": "true", "Scope": "User" } },
    { label: "rmxversion", method: "GET", path: "/rmxversion" },
    { label: "systeminfo", method: "GET", path: "/systeminfo" },
    { label: "biosinfo", method: "GET", path: "/biosinfo" },
    { label: "cpuinfo", method: "GET", path: "/cpuinfo" },
    { label: "raminfo", method: "GET", path: "/raminfo" },
    { label: "diskinfo", method: "GET", path: "/diskinfo" },
    { label: "osinfo", method: "GET", path: "/osinfo" },
    { label: "installedapps", method: "GET", path: "/installedapps" },
    ],
  },
];

export const groupOrder = ["home", "operations"];

export const groupLabels = {
  home: "Home",
  operations: "Operations",
};

export const findService = (slug) => services.find((s) => s.slug === slug);
export const servicesByGroup = (group) => services.filter((s) => s.group === group);

/**
 * Resolve the base URL for a service. Precedence (per readRuntimeEnv):
 *   1. window.__RMX_ENV__.RMX_<CODE>_HOST   — full URL incl. scheme + port
 *   2. NEXT_PUBLIC_RMX_<CODE>_HOST          — same, baked at build
 *   3. window.__RMX_ENV__.RMX_HOST + service.port
 *   4. NEXT_PUBLIC_RMX_HOST + service.port
 *   5. http://localhost + service.port
 */
export const baseUrlFor = (service) => {
  const perServiceHost = readRuntimeEnv(`RMX_${service.envKey}_HOST`, "");
  if (perServiceHost) return perServiceHost;
  const sharedHost = readRuntimeEnv("RMX_HOST", "http://localhost");
  return `${sharedHost}:${service.port}`;
};
