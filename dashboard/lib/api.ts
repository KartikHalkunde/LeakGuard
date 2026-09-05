import { sampleReport } from "./sample";
import type { Report } from "./types";

const cache = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const CACHE_MS = 30_000;
const LOCAL_DEV_TIMEOUT_MS = 10_000;

async function request<T>(path: string, fallback: T): Promise<T> {
  const base = "/api";
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const existing = pending.get(path);
  if (existing) return existing as Promise<T>;
  const operation = (async () => {
    const controller = new AbortController();
    // Local API routes may need a one-time dev compilation; keep the loader
    // visible instead of incorrectly replacing a real report with fixtures.
    const timeoutMs = LOCAL_DEV_TIMEOUT_MS;
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { Accept: "application/json" }, signal: controller.signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      const value = await response.json() as T;
      cache.set(path, { expires: Date.now() + CACHE_MS, value });
      return value;
    } catch {
      return fallback;
    } finally {
      globalThis.clearTimeout(timeout);
      pending.delete(path);
    }
  })();
  pending.set(path, operation);
  return operation;
}

export const loadFindings = () => request<Report>("/findings", sampleReport);
export async function scanRepository(): Promise<Report> {
  const response = await fetch("/api/scan", { method: "POST", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Scan failed (${response.status})`);
  const report = await response.json() as Report;
  cache.set("/findings", { expires: Date.now() + CACHE_MS, value: report });
  cache.delete("/trend");
  window.dispatchEvent(new Event("leakguard:scan-complete"));
  return report;
}

export function fixCommand(file: string): string {
  const quoted = file.includes(" ") ? `"${file.replaceAll('"', '\\"')}"` : file;
  return `leakguard fix ${quoted} --write`;
}
