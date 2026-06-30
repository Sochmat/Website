import { Db } from "mongodb";
import { connectToDatabase } from "./mongodb";
import { getTenantSlug } from "./tenantContext";
import type { Tenant } from "./types";

export class TenantError extends Error {
  status: number;
  constructor(message: string, status = 404) { super(message); this.status = status; }
}

export async function findTenantBySlug(db: Db, slug: string): Promise<Tenant | null> {
  return (await db.collection("tenants").findOne({ slug })) as Tenant | null;
}

const TTL_MS = 30_000;
const cache = new Map<string, { tenant: Tenant; expires: number }>();

export function invalidateTenant(slug: string): void { cache.delete(slug); }

export async function getTenant(): Promise<Tenant> {
  const slug = await getTenantSlug();
  if (!slug) throw new TenantError("Tenant could not be resolved", 400);
  const hit = cache.get(slug);
  if (hit && hit.expires > Date.now()) return hit.tenant;

  const { db } = await connectToDatabase();
  const tenant = await findTenantBySlug(db, slug);
  if (!tenant) throw new TenantError("Unknown tenant", 404);
  if (tenant.status === "suspended") throw new TenantError("Tenant suspended", 403);
  cache.set(slug, { tenant, expires: Date.now() + TTL_MS });
  return tenant;
}

export async function getTenantId(): Promise<string> {
  return String((await getTenant())._id);
}
