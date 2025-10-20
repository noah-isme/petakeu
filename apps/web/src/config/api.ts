import { appConfig } from "./app";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function resolveBaseUrl() {
  if (API_BASE_URL.startsWith("http")) {
    return API_BASE_URL;
  }
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return `${origin}${API_BASE_URL}`;
}

export function buildUrl(path: string, params?: Record<string, string | number | undefined>) {
  const base = resolveBaseUrl();
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, base.endsWith("/") ? base : `${base}/`);
  const mergedParams: Record<string, string | number | undefined> = {
    ...params
  };
  if (appConfig.publicMode) {
    mergedParams.public = mergedParams.public ?? "1";
  }
  if (appConfig.scenario) {
    mergedParams.scenario = mergedParams.scenario ?? appConfig.scenario;
  }

  for (const [key, value] of Object.entries(mergedParams)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}
