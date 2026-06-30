import { headers } from "next/headers";

export function readSlugFromHeaders(h: Headers): string | null {
  return h.get("x-tenant-slug");
}

export function readScopeFromHeaders(h: Headers): "super" | "tenant" | "root" | "unknown" {
  const v = h.get("x-tenant-scope");
  return v === "super" || v === "tenant" || v === "root" ? v : "unknown";
}

export async function getTenantSlug(): Promise<string | null> {
  return readSlugFromHeaders(await headers());
}

export async function getTenantScope() {
  return readScopeFromHeaders(await headers());
}
