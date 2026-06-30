import { Db } from "mongodb";
import { verifyPassword } from "@/lib/password";
import type { Session } from "@/lib/adminAuth";
import type { AdminUser } from "@/lib/types";

type Scope = { kind: "super" } | { kind: "tenant"; slug: string } | { kind: string };

export async function authenticate(
  db: Db, scope: Scope, email: string, password: string,
): Promise<Omit<Session, "exp"> | null> {
  if (scope.kind === "super") {
    const u = (await db.collection("adminUsers").findOne({ email, role: "superadmin" })) as AdminUser | null;
    if (!u || !(await verifyPassword(password, u.passwordHash))) return null;
    return { userId: String(u._id), tenantId: null, tenantSlug: null, role: "superadmin" };
  }
  if (scope.kind === "tenant") {
    const slug = (scope as { slug: string }).slug;
    const tenant = await db.collection("tenants").findOne({ slug, status: "active" });
    if (!tenant) return null;
    const u = (await db.collection("adminUsers").findOne({
      tenantId: String(tenant._id), email,
    })) as AdminUser | null;
    if (!u || u.role === "superadmin" || !(await verifyPassword(password, u.passwordHash))) return null;
    return { userId: String(u._id), tenantId: String(tenant._id), tenantSlug: slug, role: u.role };
  }
  return null;
}
