import { baseUrlFor, findService } from "@/lib/services";

const SERVICE_NAME_TO_SLUG: Record<string, string> = {
  AUTHENTICATION_SERVICE: "authentication",
  MAP_MANAGEMENT_SERVICE: "maps",
  REFERENCES_SERVICE: "references",
};

export function resolveService(serviceName: string) {
  const slug = SERVICE_NAME_TO_SLUG[serviceName] ?? serviceName.toLowerCase();
  return findService(slug);
}

export function resolveServiceBaseUrl(serviceName: string) {
  const service = resolveService(serviceName);
  if (!service) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  if (typeof window !== "undefined") {
    return baseUrlFor(service);
  }

  const hostEnvKey = `RMX_${service.envKey}_HOST`;
  const portEnvKey = `RMX_${service.envKey}_PORT`;
  const host =
    process.env[hostEnvKey] ||
    process.env[`NEXT_PUBLIC_${hostEnvKey}`] ||
    process.env.RMX_HOST ||
    process.env.NEXT_PUBLIC_RMX_HOST ||
    "http://localhost";
  const port =
    process.env[portEnvKey] ||
    process.env[`NEXT_PUBLIC_${portEnvKey}`] ||
    String(service.port);

  // Ensure the host always has a scheme — process.env.RMX_HOST may be a bare
  // hostname (e.g. "localhost") when inherited from BuildNLocalDeploy.bat.
  // Fall back to https when RMX_ENABLE_HTTPS is "true", otherwise http.
  const httpsEnabled =
    (process.env.RMX_ENABLE_HTTPS ?? "").toLowerCase() === "true";
  const fallbackScheme = httpsEnabled ? "https" : "http";
  const normHost = /^https?:\/\//i.test(host) ? host : `${fallbackScheme}://${host}`;

  // If it already carries a port, use it as-is (nothing more to append).
  if (/:\d+$/.test(normHost)) {
    return normHost;
  }

  return `${normHost}:${port}`;
}
