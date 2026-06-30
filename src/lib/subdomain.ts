export type TenantScope =
  | { kind: "super" }
  | { kind: "tenant"; slug: string }
  | { kind: "root" }
  | { kind: "unknown" };

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "admin", "www", "api", "app", "static", "assets",
]);

export function parseHost(host: string | null, rootDomain: string): TenantScope {
  if (!host) return { kind: "unknown" };
  const hostname = host.split(":")[0].toLowerCase().trim();
  const root = rootDomain.toLowerCase().trim();

  if (hostname === root) return { kind: "root" };
  if (!hostname.endsWith("." + root)) return { kind: "unknown" };

  const label = hostname.slice(0, hostname.length - root.length - 1);
  // Only a single-label subdomain is a tenant/scope; deeper hosts are unknown.
  if (label.includes(".")) return { kind: "unknown" };

  if (label === "admin") return { kind: "super" };
  if (RESERVED_SLUGS.has(label)) return { kind: "root" };
  return { kind: "tenant", slug: label };
}
