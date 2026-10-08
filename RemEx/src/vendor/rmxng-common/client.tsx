import type { ChangeEventHandler, InputHTMLAttributes, ReactNode } from "react";
import { useQuery as tanstackUseQuery } from "@tanstack/react-query";
import { resolveService, resolveServiceBaseUrl } from "./serviceConfig";
import { consoleLogger } from "./core";
import type { ErrorResponse } from "./shared";

export type ApiResponse<T> = {
  success: true;
  data: T;
};

export type ApiClient = {
  makeRequest<T>(request: {
    api: string;
    method: string;
    body?: BodyInit | null;
  }): Promise<ApiResponse<T> | ErrorResponse>;
};

function getErrorMessage(data: unknown, status: number) {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object") {
    const errorMessage =
      (data as any).error?.message ?? (data as any).message ?? (data as any).error;
    if (typeof errorMessage === "string" && errorMessage.trim()) {
      return errorMessage;
    }
  }
  return `Request failed with status ${status}`;
}

export class HttpApiClient implements ApiClient {
  constructor(private readonly serviceName: string) {}

  async makeRequest<T>({
    api,
    method,
    body,
  }: {
    api: string;
    method: string;
    body?: BodyInit | null;
  }): Promise<ApiResponse<T> | ErrorResponse> {
    const headers = new Headers({ Accept: "application/json" });
    let url: string;

    if (typeof window !== "undefined") {
      // Browser: route through the Next.js proxy (/api/proxy) so the server can
      // read the HttpOnly session cookie and forward the JWT as Bearer token.
      // Direct backend calls from the browser have no token and always get 401.
      const service = resolveService(this.serviceName);
      const slug = service?.slug ?? this.serviceName.toLowerCase().replace(/_/g, "-");
      const proxyUrl = new URL("/api/proxy", window.location.origin);
      proxyUrl.searchParams.set("service", slug);
      proxyUrl.searchParams.set("api", api.startsWith("/") ? api : `/${api}`);
      url = proxyUrl.toString();
      // Authorization header is NOT set here — the proxy reads the HttpOnly cookie.
    } else {
      // Server context (e.g. Next.js API route calling another service directly).
      const baseUrl = resolveServiceBaseUrl(this.serviceName);
      url = /^https?:\/\//i.test(api)
        ? api
        : new URL(api.replace(/^\//, ""), `${baseUrl}/`).toString();
      // No authentication in this prototype — no token to attach.
    }

    let requestBody = body;
    if (body != null && !(body instanceof FormData) && !(body instanceof Blob)) {
      headers.set("Content-Type", "application/json");
      requestBody = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : requestBody,
    });

    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    let data: unknown = raw;
    if (raw && contentType.includes("application/json")) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }

    if (!response.ok) {
      return {
        success: false,
        error: {
          message: getErrorMessage(data, response.status),
          status: response.status,
          data,
        },
      };
    }

    return { success: true, data: data as T };
  }
}

export function useLogger() {
  return consoleLogger;
}

type FieldProps = {
  label: ReactNode;
  name?: string;
  className?: string;
};

function FieldWrapper({
  label,
  name,
  className,
  children,
}: FieldProps & { children: ReactNode }) {
  return (
    <label className={className ?? "block max-w-48"}>
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      {children}
      {name ? <span className="sr-only">{name}</span> : null}
    </label>
  );
}

export function LabeledInput({
  label,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  // Use name as id if id is not provided for better autofill support
  const inputId = props.id || props.name;
  return (
    <FieldWrapper label={label} name={props.name} className={className}>
      <input
        {...props}
        id={inputId}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </FieldWrapper>
  );
}

type SelectOption = {
  value: string | number;
  label: ReactNode;
  object?: unknown;
};

export function LabeledSelect({
  label,
  name,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  getOptionKey,
  className,
}: FieldProps & {
  value: string | number;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  getOptionKey?: (option: SelectOption, index: number, name?: string) => string;
}) {
  // Use name as id for better autofill support
  const selectId = name;
  return (
    <FieldWrapper label={label} name={name} className={className}>
      <select
        id={selectId}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100"
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option, index) => (
          <option
            key={
              getOptionKey?.(option, index, name) ??
              `${name ?? "option"}-${String(option.value)}-${index}`
            }
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

export function LabeledCheckbox({
  label,
  className,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  // Use name as id if id is not provided for better autofill support
  const checkboxId = props.id || props.name;
  return (
    <label
      className={className ?? "flex items-center gap-2 text-sm font-medium text-gray-700"}
    >
      <input {...props} type="checkbox" id={checkboxId} />
      <span>{label}</span>
    </label>
  );
}

export type OffenceCode = {
  offence_Code: number;
  offence_Code_Suffix?: string | null;
  offence_Code_Text?: string | null;
};

export type TrafficCode = {
  location_Code: string;
};

export function createReferenceHooks({
  useQuery = tanstackUseQuery,
}: {
  useQuery?: typeof tanstackUseQuery;
}) {
  const referencesClient = new HttpApiClient("REFERENCES_SERVICE");

  return {
    useReferencesOffenceCodes: () =>
      useQuery({
        queryKey: ["references", "offenceCodes"],
        queryFn: () =>
          referencesClient.makeRequest<OffenceCode[]>({
            api: "v1/rmxrms/alloffencecodes",
            method: "GET",
          }),
      }),
    useReferencesTrafficCodes: () =>
      useQuery({
        queryKey: ["references", "trafficCodes"],
        queryFn: () =>
          referencesClient.makeRequest<TrafficCode[]>({
            api: "v1/rmxrms/alltrafficcodes",
            method: "GET",
          }),
      }),
  };
}
