# Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-tenant Sochmat app into the multi-tenant KitchenOS foundation: a `tenants` registry, subdomain→tenant resolution, `tenantId` isolation on every collection, DB-backed admin auth, and a migration of existing Sochmat data into a new `kitchenos` database — with the app still serving end-to-end as the `sochmat` tenant.

**Architecture:** Shared MongoDB database (`kitchenos`) with a `tenantId` on every document. Middleware parses the request subdomain and sets an `x-tenant-slug` header (no DB hit); a cached `getTenant()` helper resolves the tenant inside route handlers. A `forTenant(tenantId)` accessor injects `tenantId` into all tenant-scoped reads/writes. Admin auth moves from env credentials to an `adminUsers` collection with scrypt-hashed passwords and tenant-bound sessions.

**Tech Stack:** Next.js 16 (App Router), TypeScript, MongoDB driver 7, Node `crypto` (scrypt + AES-256-GCM), Vitest + mongodb-memory-server (new), tsx (new, for the migration script).

## Global Constraints

- **New database name:** `kitchenos` (exact). Old `Sochmat` DB is read-only source / rollback — never written to.
- **Password hashing:** Node built-in `crypto.scrypt` only. Native `bcrypt` is forbidden (EC2/Docker native-build friction).
- **Secret encryption:** AES-256-GCM via `crypto`, key from `KITCHENOS_SECRET_KEY` env. Encrypted secrets never sent to a browser.
- **No DB access inside `src/middleware.ts`.** Tenant DB lookups happen only in route handlers/server components via `getTenant()`.
- **Reserved slugs** (may never be a tenant): `admin`, `www`, `api`, `app`, `static`, `assets`.
- **Roles:** `superadmin` (tenantId null, only on `admin.<root>`), `kitchen-admin`, `shop`.
- **Session cookie** stays the existing HMAC-signed httpOnly `admin_session`; payload extended to `{ userId, tenantId, tenantSlug, role, exp }`, 12h TTL.
- **Customers are per-tenant:** `users` unique on `{tenantId, phone}`.
- **Tenant-scoped collections (12):** `users`, `orders`, `menuItems`, `categories`, `coupons`, `subscriptions`, `mealCards`, `categoryTiles`, `bannerSlides`, `otps`, `counters`, `settings`. **Platform-level (not tenant-scoped):** `tenants`, `adminUsers`.
- Commit after every task. Conventional-commit messages.

---

## File Structure

**New files**
- `src/lib/subdomain.ts` — pure host→slug/scope parsing.
- `src/lib/password.ts` — scrypt hash/verify.
- `src/lib/secrets.ts` — AES-256-GCM encrypt/decrypt.
- `src/lib/tenant.ts` — `tenants` access + cached `getTenant()` / `getTenantId()` / `invalidateTenant()`.
- `src/lib/tenantDb.ts` — `forTenant(tenantId)` scoped collection accessor.
- `src/lib/tenantContext.ts` — read `x-tenant-slug`/scope from request headers.
- `scripts/migrate-to-kitchenos.ts` — one-time migration.
- `scripts/create-indexes.ts` — index creation (imported by migration + runnable standalone).
- `vitest.config.ts`, `test/setup-mongo.ts` — test harness.
- Tests colocated as `*.test.ts` next to each unit.

**Modified files**
- `src/lib/mongodb.ts` — DB name → `kitchenos` via `MONGODB_DB`.
- `src/lib/types.ts` — add `Tenant`, `AdminUser`, role types; add `tenantId` to existing doc types.
- `src/lib/kotCounter.ts` — tenant-scoped counter keys.
- `src/lib/adminAuth.ts` — extended session payload.
- `src/middleware.ts` — subdomain resolution + tenant-bound admin gating.
- `src/app/api/admin/login/route.ts` — DB-backed login.
- Tenant-scoped API routes (refactor to `forTenant` + `getTenantId`): `api/menu`, `api/store-status`, `api/orders`, `api/subscriptions`, `api/users/*`, `api/admin/{menu,categories,coupons,meal-cards,tiles,banner,store-status,delivery-status,orders}`, `api/print/{kot,bill}`.
- `package.json` — add devDeps + scripts.
- `README` / `tools/kot-print-agent/README.md` — dev subdomains + env.

---

### Task 1: Test harness + tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`, `test/setup-mongo.ts`

**Interfaces:**
- Produces: `npm test` (vitest run), `npm run test:watch`; helper `withMemoryMongo()` returning a connected `Db` for integration tests; `tsx` available for scripts.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm i -D vitest@^2 mongodb-memory-server@^10 tsx@^4
```
Expected: installs without native build errors (mongodb-memory-server downloads a Mongo binary on first test run).

- [ ] **Step 2: Add scripts to `package.json`**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"migrate:kitchenos": "tsx scripts/migrate-to-kitchenos.ts",
"create-indexes": "tsx scripts/create-indexes.ts"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 30000, // memory-mongo first boot
  },
});
```

- [ ] **Step 4: Create `test/setup-mongo.ts`**

```ts
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, Db } from "mongodb";

export async function withMemoryMongo(): Promise<{
  db: Db;
  cleanup: () => Promise<void>;
}> {
  const server = await MongoMemoryServer.create();
  const client = await MongoClient.connect(server.getUri());
  const db = client.db("kitchenos_test");
  return {
    db,
    cleanup: async () => {
      await client.close();
      await server.stop();
    },
  };
}
```

- [ ] **Step 5: Smoke test the harness**

Create `test/harness.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "./setup-mongo";

describe("harness", () => {
  it("connects to memory mongo", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("ping").insertOne({ ok: 1 });
    expect(await db.collection("ping").countDocuments()).toBe(1);
    await cleanup();
  });
});
```

- [ ] **Step 6: Run and verify pass**

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts test/
git commit -m "test: add vitest + mongodb-memory-server harness and tsx runner"
```

---

### Task 2: Subdomain parsing util

**Files:**
- Create: `src/lib/subdomain.ts`, `src/lib/subdomain.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type TenantScope =
    | { kind: "super" }                 // admin.<root>
    | { kind: "tenant"; slug: string }  // <slug>.<root>
    | { kind: "root" }                  // apex or www
    | { kind: "unknown" };              // host doesn't match root domain
  function parseHost(host: string | null, rootDomain: string): TenantScope;
  const RESERVED_SLUGS: ReadonlySet<string>;
  ```

- [ ] **Step 1: Write failing tests**

`src/lib/subdomain.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseHost } from "./subdomain";

const ROOT = "kitchenos.app";

describe("parseHost", () => {
  it("resolves a tenant subdomain", () => {
    expect(parseHost("biryani-hub.kitchenos.app", ROOT)).toEqual({ kind: "tenant", slug: "biryani-hub" });
  });
  it("strips port", () => {
    expect(parseHost("biryani-hub.localhost:3000", "localhost")).toEqual({ kind: "tenant", slug: "biryani-hub" });
  });
  it("treats admin as super scope", () => {
    expect(parseHost("admin.kitchenos.app", ROOT)).toEqual({ kind: "super" });
  });
  it("treats apex as root", () => {
    expect(parseHost("kitchenos.app", ROOT)).toEqual({ kind: "root" });
  });
  it("treats www as root", () => {
    expect(parseHost("www.kitchenos.app", ROOT)).toEqual({ kind: "root" });
  });
  it("flags reserved non-admin slugs as root (never a tenant)", () => {
    expect(parseHost("api.kitchenos.app", ROOT)).toEqual({ kind: "root" });
  });
  it("returns unknown for a foreign host", () => {
    expect(parseHost("evil.com", ROOT)).toEqual({ kind: "unknown" });
  });
  it("returns unknown for null host", () => {
    expect(parseHost(null, ROOT)).toEqual({ kind: "unknown" });
  });
  it("lowercases the slug", () => {
    expect(parseHost("Biryani-Hub.kitchenos.app", ROOT)).toEqual({ kind: "tenant", slug: "biryani-hub" });
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- subdomain`
Expected: FAIL (cannot find module `./subdomain`).

- [ ] **Step 3: Implement**

`src/lib/subdomain.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- subdomain`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/subdomain.ts src/lib/subdomain.test.ts
git commit -m "feat: subdomain -> tenant scope parser"
```

---

### Task 3: Password hashing (scrypt)

**Files:**
- Create: `src/lib/password.ts`, `src/lib/password.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function hashPassword(plain: string): Promise<string>;     // "scrypt$N$r$p$saltB64$hashB64"
  function verifyPassword(plain: string, stored: string): Promise<boolean>;
  ```

- [ ] **Step 1: Write failing tests**

`src/lib/password.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("verifies a correct password", async () => {
    const h = await hashPassword("s3cret!");
    expect(await verifyPassword("s3cret!", h)).toBe(true);
  });
  it("rejects a wrong password", async () => {
    const h = await hashPassword("s3cret!");
    expect(await verifyPassword("nope", h)).toBe(false);
  });
  it("produces distinct hashes for the same input (random salt)", async () => {
    expect(await hashPassword("x")).not.toBe(await hashPassword("x"));
  });
  it("returns false on a malformed stored value", async () => {
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- password`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/password.ts`:
```ts
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const N = 16384, r = 8, p = 1, KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = (await scryptAsync(plain, salt, KEYLEN, { N, r, p })) as Buffer;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, rr, pp, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const dk = (await scryptAsync(plain, salt, expected.length, {
      N: Number(n), r: Number(rr), p: Number(pp),
    })) as Buffer;
    return dk.length === expected.length && timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- password`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/password.ts src/lib/password.test.ts
git commit -m "feat: scrypt password hashing (no native deps)"
```

---

### Task 4: Secret encryption (AES-256-GCM)

**Files:**
- Create: `src/lib/secrets.ts`, `src/lib/secrets.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function encryptSecret(plain: string): string;   // "v1:ivB64:tagB64:cipherB64"
  function decryptSecret(blob: string): string;
  ```
  Key from `KITCHENOS_SECRET_KEY` (base64, 32 bytes).

- [ ] **Step 1: Write failing tests**

`src/lib/secrets.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";

beforeAll(() => {
  process.env.KITCHENOS_SECRET_KEY = randomBytes(32).toString("base64");
});

describe("secrets", () => {
  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await import("./secrets");
    const blob = encryptSecret("rzp_secret_123");
    expect(blob).not.toContain("rzp_secret_123");
    expect(decryptSecret(blob)).toBe("rzp_secret_123");
  });
  it("throws on tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await import("./secrets");
    const blob = encryptSecret("abc").replace(/.$/, (c) => (c === "A" ? "B" : "A"));
    expect(() => decryptSecret(blob)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- secrets`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/secrets.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function key(): Buffer {
  const b64 = process.env.KITCHENOS_SECRET_KEY;
  if (!b64) throw new Error("KITCHENOS_SECRET_KEY is not set");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("KITCHENOS_SECRET_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const [v, ivB64, tagB64, dataB64] = blob.split(":");
  if (v !== "v1") throw new Error("unsupported secret version");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- secrets`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/secrets.ts src/lib/secrets.test.ts
git commit -m "feat: AES-256-GCM secret encryption helper"
```

---

### Task 5: Types — Tenant, AdminUser, tenantId on docs

**Files:**
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `Tenant`, `AdminUser`, `Role`, `TenantScope` (re-export) interfaces; `tenantId?: string` added to existing doc interfaces (`Order`, `MenuItem`, `Category`, `Coupon`, `User`, `MealCard`, etc.).

- [ ] **Step 1: Add new types**

Append to `src/lib/types.ts`:
```ts
export type Role = "superadmin" | "kitchen-admin" | "shop";

export interface TenantBranding { logoUrl: string; primaryColor: string; accentColor: string; }
export interface TenantDeliveryZone { id: string; name: string; sector: string; towers: string[]; }
export interface TenantIntegrations {
  razorpay: { keyId: string; keySecretEnc: string; enabled: boolean } | null;
  petpooja: { appKey: string; appSecretEnc: string; accessToken: string; restId: string; enabled: boolean } | null;
  smtp: { host: string; port: number; user: string; passEnc: string; from: string; secure: boolean; authMethod: string } | null;
  printAgentToken: string;
}
export interface Tenant {
  _id?: string;
  slug: string;
  name: string;
  legalName: string;
  status: "active" | "suspended";
  branding: TenantBranding;
  contact: { phone: string; email: string; address: string };
  compliance: { gstNo: string; fssaiNo: string };
  location: { lat: number; lng: number; serviceRadiusKm: number };
  deliveryZones: TenantDeliveryZone[];
  integrations: TenantIntegrations;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface AdminUser {
  _id?: string;
  tenantId: string | null;
  email: string;
  passwordHash: string;
  role: Role;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}
```

- [ ] **Step 2: Add `tenantId` to existing doc interfaces**

In each existing interface that maps to a tenant-scoped collection (`Order`, `OrderItem`'s parent `Order`, `MenuItem`, `Category`, `Coupon`, `User`, `MealCard`, and any subscription/tile/banner types present), add:
```ts
  tenantId?: string;
```
(Optional at the type level so existing constructors compile; the data layer always sets it.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: Tenant/AdminUser types + tenantId on doc types"
```

---

### Task 6: DB name → kitchenos

**Files:**
- Modify: `src/lib/mongodb.ts:4`

**Interfaces:**
- Produces: `connectToDatabase()` returns the `kitchenos` DB by default.

- [ ] **Step 1: Change default DB name**

In `src/lib/mongodb.ts`, change:
```ts
const MONGODB_DB = process.env.MONGODB_DB || "Sochmat";
```
to:
```ts
const MONGODB_DB = process.env.MONGODB_DB || "kitchenos";
```

- [ ] **Step 2: Document env**

Add to `.env.example` (create if absent) the keys: `MONGODB_DB=kitchenos`, `ROOT_DOMAIN=localhost`, `KITCHENOS_SECRET_KEY=`, `SUPERADMIN_EMAIL=`, `SUPERADMIN_PASSWORD=`.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.
```bash
git add src/lib/mongodb.ts .env.example
git commit -m "chore: default DB to kitchenos; document new env"
```

---

### Task 7: Tenant context (request headers)

**Files:**
- Create: `src/lib/tenantContext.ts`, `src/lib/tenantContext.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function getTenantSlug(): Promise<string | null>;   // from x-tenant-slug header
  function getTenantScope(): Promise<"super" | "tenant" | "root" | "unknown">;
  ```
  (Uses Next `headers()` from `next/headers`.)

- [ ] **Step 1: Write failing test (pure helper extracted)**

To keep this unit testable without Next's request context, factor the logic into a pure function and a thin wrapper.

`src/lib/tenantContext.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readSlugFromHeaders, readScopeFromHeaders } from "./tenantContext";

describe("tenantContext pure readers", () => {
  it("reads slug header", () => {
    expect(readSlugFromHeaders(new Headers({ "x-tenant-slug": "biryani-hub" }))).toBe("biryani-hub");
  });
  it("returns null when absent", () => {
    expect(readSlugFromHeaders(new Headers())).toBeNull();
  });
  it("reads scope header defaulting to unknown", () => {
    expect(readScopeFromHeaders(new Headers({ "x-tenant-scope": "super" }))).toBe("super");
    expect(readScopeFromHeaders(new Headers())).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- tenantContext`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/tenantContext.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify pass + commit**

Run: `npm test -- tenantContext`
Expected: PASS (3 tests).
```bash
git add src/lib/tenantContext.ts src/lib/tenantContext.test.ts
git commit -m "feat: request-header tenant context readers"
```

---

### Task 8: Tenant registry + cached resolver

**Files:**
- Create: `src/lib/tenant.ts`, `src/lib/tenant.test.ts`

**Interfaces:**
- Consumes: `connectToDatabase` (mongodb.ts), `getTenantSlug` (tenantContext.ts), `Tenant` (types.ts).
- Produces:
  ```ts
  function findTenantBySlug(db: Db, slug: string): Promise<Tenant | null>;  // pure-ish, testable
  function getTenant(): Promise<Tenant>;          // header slug -> cached lookup; throws TenantError
  function getTenantId(): Promise<string>;
  function invalidateTenant(slug: string): void;
  class TenantError extends Error { status: number }
  ```
- Cache: in-memory `Map<slug, {tenant, expires}>`, TTL 30_000ms.

- [ ] **Step 1: Write failing integration test**

`src/lib/tenant.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "../../test/setup-mongo";
import { findTenantBySlug } from "./tenant";

describe("findTenantBySlug", () => {
  it("returns an active tenant by slug", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("tenants").insertOne({ slug: "sochmat", name: "Sochmat", status: "active" });
    const t = await findTenantBySlug(db, "sochmat");
    expect(t?.name).toBe("Sochmat");
    await cleanup();
  });
  it("returns null for unknown slug", async () => {
    const { db, cleanup } = await withMemoryMongo();
    expect(await findTenantBySlug(db, "nope")).toBeNull();
    await cleanup();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- "src/lib/tenant.test"`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/tenant.ts`:
```ts
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
```
> Note: `Date.now()` is fine in app runtime; it is only forbidden inside Workflow scripts.

- [ ] **Step 4: Run to verify pass + commit**

Run: `npm test -- "src/lib/tenant.test"`
Expected: PASS (2 tests).
```bash
git add src/lib/tenant.ts src/lib/tenant.test.ts
git commit -m "feat: tenant registry lookup + cached resolver"
```

---

### Task 9: Scoped data accessor `forTenant`

**Files:**
- Create: `src/lib/tenantDb.ts`, `src/lib/tenantDb.test.ts`

**Interfaces:**
- Consumes: `connectToDatabase`.
- Produces:
  ```ts
  function forTenant(tenantId: string): Promise<ScopedDb>;
  interface ScopedDb {
    find(coll: string, filter?: object): FindCursor;
    findOne(coll: string, filter?: object): Promise<any>;
    insertOne(coll: string, doc: object): Promise<InsertOneResult>;
    insertMany(coll: string, docs: object[]): Promise<InsertManyResult>;
    updateOne(coll: string, filter: object, update: object, opts?: object): Promise<UpdateResult>;
    updateMany(coll: string, filter: object, update: object): Promise<UpdateResult>;
    deleteOne(coll: string, filter: object): Promise<DeleteResult>;
    deleteMany(coll: string, filter: object): Promise<DeleteResult>;
    countDocuments(coll: string, filter?: object): Promise<number>;
    raw(coll: string): Collection;   // escape hatch (still must scope manually)
  }
  ```
  Every method merges `{ tenantId }` into the filter and sets `doc.tenantId` on inserts. Only tenant-scoped collections are valid; passing `tenants`/`adminUsers` throws.

- [ ] **Step 1: Write failing tests (isolation is the contract)**

`src/lib/tenantDb.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { withMemoryMongo } from "../../test/setup-mongo";

vi.mock("./mongodb", () => ({ connectToDatabase: async () => mockConn }));
let mockConn: { db: any };

import { forTenant } from "./tenantDb";

describe("forTenant isolation", () => {
  it("scopes find and insert to the tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    mockConn = { db };
    const A = await forTenant("aaaaaaaaaaaaaaaaaaaaaaaa");
    const B = await forTenant("bbbbbbbbbbbbbbbbbbbbbbbb");
    await A.insertOne("orders", { orderNumber: "A1" });
    await B.insertOne("orders", { orderNumber: "B1" });
    const aOrders = await A.find("orders").toArray();
    expect(aOrders).toHaveLength(1);
    expect(aOrders[0].orderNumber).toBe("A1");
    expect(aOrders[0].tenantId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(await B.countDocuments("orders")).toBe(1);
    await cleanup();
  });
  it("rejects platform-level collections", async () => {
    const { db, cleanup } = await withMemoryMongo();
    mockConn = { db };
    const A = await forTenant("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(() => A.raw("tenants")).toThrow();
    await cleanup();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- tenantDb`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/lib/tenantDb.ts`:
```ts
import { Collection } from "mongodb";
import { connectToDatabase } from "./mongodb";

const TENANT_SCOPED = new Set([
  "users", "orders", "menuItems", "categories", "coupons", "subscriptions",
  "mealCards", "categoryTiles", "bannerSlides", "otps", "settings",
]);
// `counters` is scoped via key, not filter — handled in kotCounter. Not exposed here.

export interface ScopedDb {
  raw(coll: string): Collection;
  find(coll: string, filter?: object): ReturnType<Collection["find"]>;
  findOne(coll: string, filter?: object): Promise<any>;
  insertOne(coll: string, doc: object): Promise<any>;
  insertMany(coll: string, docs: object[]): Promise<any>;
  updateOne(coll: string, filter: object, update: object, opts?: object): Promise<any>;
  updateMany(coll: string, filter: object, update: object): Promise<any>;
  deleteOne(coll: string, filter: object): Promise<any>;
  deleteMany(coll: string, filter: object): Promise<any>;
  countDocuments(coll: string, filter?: object): Promise<number>;
}

export async function forTenant(tenantId: string): Promise<ScopedDb> {
  const { db } = await connectToDatabase();
  const guard = (coll: string): Collection => {
    if (!TENANT_SCOPED.has(coll)) throw new Error(`Collection '${coll}' is not tenant-scoped`);
    return db.collection(coll);
  };
  const scope = (filter: object = {}) => ({ ...filter, tenantId });
  const stamp = (doc: object) => ({ ...doc, tenantId });
  return {
    raw: guard,
    find: (c, f) => guard(c).find(scope(f)),
    findOne: (c, f) => guard(c).findOne(scope(f)),
    insertOne: (c, d) => guard(c).insertOne(stamp(d)),
    insertMany: (c, ds) => guard(c).insertMany(ds.map(stamp)),
    updateOne: (c, f, u, o) => guard(c).updateOne(scope(f), u, o),
    updateMany: (c, f, u) => guard(c).updateMany(scope(f), u),
    deleteOne: (c, f) => guard(c).deleteOne(scope(f)),
    deleteMany: (c, f) => guard(c).deleteMany(scope(f)),
    countDocuments: (c, f) => guard(c).countDocuments(scope(f)),
  };
}
```

- [ ] **Step 4: Run to verify pass + commit**

Run: `npm test -- tenantDb`
Expected: PASS (2 tests).
```bash
git add src/lib/tenantDb.ts src/lib/tenantDb.test.ts
git commit -m "feat: forTenant scoped DB accessor (auto tenantId filter/stamp)"
```

---

### Task 10: Tenant-scoped counters

**Files:**
- Modify: `src/lib/kotCounter.ts`

**Interfaces:**
- Consumes: existing counter logic.
- Produces: counter `_id`s prefixed with tenant — `nextKotNumber(tenantId)`, `nextBillNumber(tenantId)` (or existing names gaining a `tenantId` first param). Keys become `"<tenantId>:kot:YYYY-MM-DD"` and `"<tenantId>:bill:global"`.

- [ ] **Step 1: Write failing test**

`src/lib/kotCounter.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { withMemoryMongo } from "../../test/setup-mongo";
vi.mock("./mongodb", () => ({ connectToDatabase: async () => mockConn }));
let mockConn: { db: any };
import { nextKotNumber } from "./kotCounter";

describe("nextKotNumber", () => {
  it("keeps independent sequences per tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    mockConn = { db };
    const a1 = await nextKotNumber("A");
    const a2 = await nextKotNumber("A");
    const b1 = await nextKotNumber("B");
    expect(a1).toBe(1); expect(a2).toBe(2); expect(b1).toBe(1);
    await cleanup();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- kotCounter`
Expected: FAIL (signature mismatch / undefined).

- [ ] **Step 3: Implement**

Refactor `src/lib/kotCounter.ts` so each exported counter takes `tenantId: string` and builds the `_id` as `` `${tenantId}:kot:${dateKey}` `` / `` `${tenantId}:bill:global` ``, using the existing `findOneAndUpdate(..., { $inc: { seq: 1 } }, { upsert:true, returnDocument:"after" })` pattern. Keep the date-key (Asia/Kolkata) logic intact.

- [ ] **Step 4: Run to verify pass + commit**

Run: `npm test -- kotCounter`
Expected: PASS.
```bash
git add src/lib/kotCounter.ts src/lib/kotCounter.test.ts
git commit -m "feat: tenant-scoped KOT/bill counters"
```

---

### Task 11: Extend session payload

**Files:**
- Modify: `src/lib/adminAuth.ts`

**Interfaces:**
- Produces:
  ```ts
  interface Session { userId: string; tenantId: string | null; tenantSlug: string | null; role: Role; exp: number }
  function createSession(payload: Omit<Session,"exp">): string;   // signed cookie value
  function verifySession(value?: string): Promise<Session | null>;
  ```
  Keeps HMAC signing + 12h TTL.

- [ ] **Step 1: Write failing test**

`src/lib/adminAuth.test.ts`:
```ts
import { describe, it, expect, beforeAll } from "vitest";
beforeAll(() => { process.env.ADMIN_SESSION_SECRET = "test-secret"; });

describe("session round-trip", () => {
  it("signs and verifies a session with tenant binding", async () => {
    const { createSession, verifySession } = await import("./adminAuth");
    const token = createSession({ userId: "u1", tenantId: "t1", tenantSlug: "sochmat", role: "kitchen-admin" });
    const s = await verifySession(token);
    expect(s?.tenantSlug).toBe("sochmat");
    expect(s?.role).toBe("kitchen-admin");
  });
  it("rejects a tampered token", async () => {
    const { createSession, verifySession } = await import("./adminAuth");
    const token = createSession({ userId: "u1", tenantId: "t1", tenantSlug: "sochmat", role: "shop" });
    expect(await verifySession(token + "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- adminAuth`
Expected: FAIL (payload shape / exports differ).

- [ ] **Step 3: Implement**

Update `src/lib/adminAuth.ts` to the new `Session` shape (add `userId`, `tenantId`, `tenantSlug`), keeping the existing HMAC sign/verify and `ADMIN_COOKIE`/TTL. Preserve current exports used elsewhere (`ADMIN_COOKIE`, `verifySession`); add `createSession`.

- [ ] **Step 4: Run to verify pass + commit**

Run: `npm test -- adminAuth`
Expected: PASS.
```bash
git add src/lib/adminAuth.ts src/lib/adminAuth.test.ts
git commit -m "feat: tenant-bound admin session payload"
```

---

### Task 12: Middleware — subdomain resolution + tenant-bound gating

**Files:**
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `parseHost` (subdomain.ts), `verifySession` (adminAuth.ts), existing `rateLimit`.
- Produces: sets `x-tenant-slug` / `x-tenant-scope` request headers on forwarded requests; enforces tenant/super gating.

- [ ] **Step 1: Implement resolution + header injection**

In `src/middleware.ts`:
- Read `const host = request.headers.get("host")`; `const scope = parseHost(host, process.env.ROOT_DOMAIN || "localhost")`.
- Build `requestHeaders = new Headers(request.headers)` and set `x-tenant-scope` to `scope.kind`, and `x-tenant-slug` to `scope.slug` when `kind==="tenant"`.
- Keep the existing global rate-limit block.
- Replace the admin-gating block: a request needing auth must have a valid session AND:
  - if path is super-admin only or host scope is `super`: require `session.role === "superadmin"` and `scope.kind === "super"`.
  - else (tenant admin): require `scope.kind === "tenant"` and `session.tenantSlug === scope.slug` and `session.role !== "superadmin"`.
- Return `NextResponse.next({ request: { headers: requestHeaders } })` so downstream reads the tenant headers.
- Unknown scope on a storefront/API path: allow through (route handlers return 404 via `getTenant()`), except `/api/admin` which returns 401.

Full replacement body:
```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { ADMIN_COOKIE, verifySession } from "@/lib/adminAuth";
import { parseHost } from "@/lib/subdomain";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/login", "/api/admin/logout"];
const isPublicAdminPath = (p: string) =>
  PUBLIC_ADMIN_PATHS.some((x) => p === x || p.startsWith(x + "/"));

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const scope = parseHost(request.headers.get("host"), process.env.ROOT_DOMAIN || "localhost");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-scope", scope.kind);
  if (scope.kind === "tenant") requestHeaders.set("x-tenant-slug", scope.slug);
  else requestHeaders.delete("x-tenant-slug");
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });

  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/print/")) {
    const limited = await rateLimit(request, limiters.global);
    if (limited) return limited;
  }

  const needsAuth =
    (pathname.startsWith("/api/admin") || pathname.startsWith("/admin")) &&
    !isPublicAdminPath(pathname);

  if (needsAuth) {
    const session = await verifySession(request.cookies.get(ADMIN_COOKIE)?.value);
    const ok =
      !!session &&
      (scope.kind === "super"
        ? session.role === "superadmin"
        : scope.kind === "tenant" &&
          session.role !== "superadmin" &&
          session.tenantSlug === scope.slug);
    if (!ok) {
      if (pathname.startsWith("/api/"))
        return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }
  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: compiles; middleware listed.

- [ ] **Step 3: Manual smoke (documented, optional in CI)**

With a seeded tenant (after Task 16 migration), `curl -H "Host: sochmat.localhost:3000" localhost:3000/api/store-status` returns 200; `Host: nope.localhost:3000` returns the unknown-tenant 404 from the route layer.

- [ ] **Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: subdomain tenant resolution + tenant-bound admin gating in middleware"
```

---

### Task 13: DB-backed admin login

**Files:**
- Modify: `src/app/api/admin/login/route.ts`

**Interfaces:**
- Consumes: `verifyPassword` (password.ts), `createSession` (adminAuth.ts), `parseHost`/scope via headers, `connectToDatabase`.
- Produces: authenticates against `adminUsers`, scope-aware (super on `admin.`, tenant otherwise), sets the cookie.

- [ ] **Step 1: Write failing test (pure auth resolver)**

Factor the credential check into a pure function `authenticate(db, scope, email, password)` returning `Session | null`, and test it:

`src/app/api/admin/login/authenticate.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { withMemoryMongo } from "../../../../../test/setup-mongo";
import { hashPassword } from "@/lib/password";
import { authenticate } from "./authenticate";

describe("authenticate", () => {
  it("logs in a kitchen-admin within their tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("tenants").insertOne({ _id: "t1" as any, slug: "sochmat", status: "active" });
    await db.collection("adminUsers").insertOne({
      tenantId: "t1", email: "a@s.com", role: "kitchen-admin", name: "A",
      passwordHash: await hashPassword("pw"),
    });
    const s = await authenticate(db, { kind: "tenant", slug: "sochmat" }, "a@s.com", "pw");
    expect(s?.role).toBe("kitchen-admin");
    expect(s?.tenantSlug).toBe("sochmat");
    await cleanup();
  });
  it("rejects wrong tenant", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("tenants").insertOne({ _id: "t1" as any, slug: "sochmat", status: "active" });
    await db.collection("adminUsers").insertOne({
      tenantId: "t1", email: "a@s.com", role: "kitchen-admin", name: "A",
      passwordHash: await hashPassword("pw"),
    });
    expect(await authenticate(db, { kind: "tenant", slug: "other" }, "a@s.com", "pw")).toBeNull();
    await cleanup();
  });
  it("logs in superadmin only on super scope", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await db.collection("adminUsers").insertOne({
      tenantId: null, email: "root@k.com", role: "superadmin", name: "Root",
      passwordHash: await hashPassword("pw"),
    });
    expect((await authenticate(db, { kind: "super" }, "root@k.com", "pw"))?.role).toBe("superadmin");
    expect(await authenticate(db, { kind: "tenant", slug: "sochmat" }, "root@k.com", "pw")).toBeNull();
    await cleanup();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- authenticate`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `authenticate` + wire the route**

Create `src/app/api/admin/login/authenticate.ts`:
```ts
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
```
Then rewrite `route.ts` `POST` to: read scope from `x-tenant-scope`/`x-tenant-slug` headers, parse `{email,password}`, call `authenticate`, and on success `createSession(...)` + set the `ADMIN_COOKIE`. On failure return `401`. Remove the env-credential `matchRole`.

- [ ] **Step 4: Run to verify pass + typecheck + commit**

Run: `npm test -- authenticate && npx tsc --noEmit`
Expected: PASS, clean.
```bash
git add src/app/api/admin/login/
git commit -m "feat: DB-backed scope-aware admin login (scrypt, tenant-bound session)"
```

---

### Task 14: Refactor customer-facing APIs to tenant scope

**Files:**
- Modify: `src/app/api/menu/route.ts`, `src/app/api/store-status/route.ts`, `src/app/api/orders/route.ts`, `src/app/api/subscriptions/route.ts`, `src/app/api/users/route.ts`, `src/app/api/users/login/route.ts`, `src/app/api/users/google/route.ts`, `src/app/api/users/otp/{send,verify,register}/route.ts`

**Interfaces:**
- Consumes: `getTenant`, `getTenantId`, `TenantError` (tenant.ts), `forTenant` (tenantDb.ts), `nextKotNumber`/`nextBillNumber` (kotCounter.ts).
- Produces: every read/write filtered by the resolved tenant; consistent `TenantError` → HTTP mapping.

- [ ] **Step 1: Add a shared error mapper**

Create `src/lib/apiTenant.ts`:
```ts
import { NextResponse } from "next/server";
import { getTenantId, TenantError } from "./tenant";

export async function resolveTenantId(): Promise<
  { tenantId: string } | { error: NextResponse }
> {
  try {
    return { tenantId: await getTenantId() };
  } catch (e) {
    const status = e instanceof TenantError ? e.status : 500;
    const message = e instanceof TenantError ? e.message : "Tenant resolution failed";
    return { error: NextResponse.json({ success: false, message }, { status }) };
  }
}
```

- [ ] **Step 2: Refactor `api/menu` and `api/store-status` (read paths)**

`api/menu/route.ts`: at the top of `GET`, `const r = await resolveTenantId(); if ("error" in r) return r.error;` then replace `db.collection("menuItems").find({...})` with `const t = await forTenant(r.tenantId); t.find("menuItems", {...})`. Same for `categories`.

`api/store-status/route.ts`: replace the two `settings.findOne({key:"store"|"delivery"})` reads with tenant-scoped `t.findOne("settings", { key: "store" })` / `{ key: "delivery" }`. Keep the `open`/`delivery` defaults.

- [ ] **Step 3: Refactor `api/orders` (write path + counters + settings guards)**

In `POST`:
- Resolve `tenantId` first; on error return it.
- The store-closed / delivery-off guards read settings via `forTenant(tenantId).findOne("settings", {key})`.
- Build `orderDoc` without `tenantId` and insert via `forTenant(tenantId).insertOne("orders", orderDoc)` (the accessor stamps `tenantId`).
- Any KOT/bill number assignment uses `nextKotNumber(tenantId)` / `nextBillNumber(tenantId)`.
- `GET` (order history / lookups) filtered through `forTenant`.

- [ ] **Step 4: Refactor `api/subscriptions` and `api/users/*`**

`subscriptions`: scope reads/writes via `forTenant`.
`users/*`: OTP send/verify/register and login/google look up and create users via `forTenant(tenantId)` so a phone is unique per tenant (`{tenantId, phone}`); the OTP docs are tenant-scoped too.

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/lib/apiTenant.ts src/app/api/menu src/app/api/store-status src/app/api/orders src/app/api/subscriptions src/app/api/users
git commit -m "feat: scope customer-facing APIs (menu, store-status, orders, subs, users) to tenant"
```

---

### Task 15: Refactor admin APIs to tenant scope

**Files:**
- Modify: `src/app/api/admin/{menu,categories,coupons,meal-cards,tiles,banner,store-status,delivery-status,orders}/route.ts`

**Interfaces:**
- Consumes: `resolveTenantId` (apiTenant.ts), `forTenant`.
- Produces: admin CRUD scoped to the caller's tenant (tenant taken from the resolved subdomain, which the middleware already verified matches the session).

- [ ] **Step 1: Refactor each admin route**

For every route above: at the start of each handler add `const r = await resolveTenantId(); if ("error" in r) return r.error;` then replace direct `db.collection(X)...` with `const t = await forTenant(r.tenantId); t.<op>(X, ...)`. For `store-status`/`delivery-status` writes, the upsert becomes `t.updateOne("settings", { key }, { $set: {...} }, { upsert: true })` (the accessor scopes the `{key}` filter and stamps `tenantId` on upsert insert).

> Note: confirm the scoped `updateOne` upsert stamps `tenantId`. If MongoDB's upsert does not apply the merged filter's `tenantId` into the inserted doc automatically, add `$setOnInsert: { tenantId }` — add a `tenantDb` test asserting an upsert insert carries `tenantId`, and implement `$setOnInsert` in the accessor's `updateOne` when `opts.upsert` is true.

- [ ] **Step 2: Add upsert-stamps-tenant test (guards the note above)**

Add to `src/lib/tenantDb.test.ts`:
```ts
it("stamps tenantId on upsert insert", async () => {
  const { db, cleanup } = await withMemoryMongo();
  mockConn = { db };
  const A = await forTenant("aaaaaaaaaaaaaaaaaaaaaaaa");
  await A.updateOne("settings", { key: "store" }, { $set: { open: false } }, { upsert: true });
  const doc = await db.collection("settings").findOne({ key: "store" });
  expect(doc?.tenantId).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
  await cleanup();
});
```
Run: `npm test -- tenantDb` — if it fails, update `forTenant.updateOne` to add `$setOnInsert: { tenantId }` when `opts?.upsert`. Re-run to PASS.

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tenantDb.ts src/lib/tenantDb.test.ts src/app/api/admin
git commit -m "feat: scope admin CRUD APIs to tenant"
```

---

### Task 16: Per-tenant print routes

**Files:**
- Modify: `src/app/api/print/kot/route.ts`, `src/app/api/print/bill/route.ts`

**Interfaces:**
- Consumes: `connectToDatabase`, `forTenant`.
- Produces: print routes resolve the tenant from the Bearer token by matching `tenants.integrations.printAgentToken`, then filter the queue via `forTenant(tenantId)`.

- [ ] **Step 1: Add token→tenant resolver**

Create `src/lib/printAuth.ts`:
```ts
import { connectToDatabase } from "./mongodb";

export async function tenantIdForPrintToken(token: string | null): Promise<string | null> {
  if (!token) return null;
  const { db } = await connectToDatabase();
  const t = await db.collection("tenants").findOne(
    { "integrations.printAgentToken": token, status: "active" },
    { projection: { _id: 1 } },
  );
  return t ? String(t._id) : null;
}
```

- [ ] **Step 2: Rewrite auth in both print routes**

Replace the `process.env.PRINT_AGENT_TOKEN` comparison with: extract the Bearer token, `const tenantId = await tenantIdForPrintToken(token); if (!tenantId) return 401;`. Then build the queue with `forTenant(tenantId)` instead of unscoped `db.collection("orders")`. Keep the existing enrich/mapping (incl. the variant/add-on fields already added).

- [ ] **Step 3: Typecheck + build + commit**

Run: `npx tsc --noEmit && npm run build`
Expected: clean.
```bash
git add src/lib/printAuth.ts src/app/api/print
git commit -m "feat: resolve print queue tenant from per-tenant agent token"
```

---

### Task 17: Index creation script

**Files:**
- Create: `scripts/create-indexes.ts`

**Interfaces:**
- Produces: `createIndexes(db: Db): Promise<void>` creating all compound/unique indexes from the spec; runnable via `npm run create-indexes`.

- [ ] **Step 1: Write failing test**

`scripts/create-indexes.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "../test/setup-mongo";
import { createIndexes } from "./create-indexes";

describe("createIndexes", () => {
  it("creates per-tenant unique order index", async () => {
    const { db, cleanup } = await withMemoryMongo();
    await createIndexes(db);
    await db.collection("orders").insertOne({ tenantId: "A", orderNumber: "1" });
    await expect(
      db.collection("orders").insertOne({ tenantId: "A", orderNumber: "1" }),
    ).rejects.toThrow();
    // same orderNumber under a different tenant is allowed
    await db.collection("orders").insertOne({ tenantId: "B", orderNumber: "1" });
    expect(await db.collection("orders").countDocuments()).toBe(2);
    await cleanup();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- create-indexes`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`scripts/create-indexes.ts`:
```ts
import { Db, MongoClient } from "mongodb";

export async function createIndexes(db: Db): Promise<void> {
  await db.collection("tenants").createIndex({ slug: 1 }, { unique: true });
  await db.collection("adminUsers").createIndex({ tenantId: 1, email: 1 }, { unique: true });
  await db.collection("orders").createIndex({ tenantId: 1, orderNumber: 1 }, { unique: true });
  await db.collection("orders").createIndex({ tenantId: 1, status: 1, kotPrinted: 1 });
  await db.collection("users").createIndex({ tenantId: 1, phone: 1 }, { unique: true });
  await db.collection("coupons").createIndex({ tenantId: 1, code: 1 }, { unique: true });
  await db.collection("menuItems").createIndex({ tenantId: 1, category: 1 });
  for (const c of ["categories","subscriptions","mealCards","categoryTiles","bannerSlides","settings"])
    await db.collection(c).createIndex({ tenantId: 1 });
  await db.collection("settings").createIndex({ tenantId: 1, key: 1 }, { unique: true });
}

if (process.argv[1]?.endsWith("create-indexes.ts")) {
  (async () => {
    const client = await MongoClient.connect(process.env.MONGODB_URI!);
    await createIndexes(client.db(process.env.MONGODB_DB || "kitchenos"));
    await client.close();
    console.log("indexes created");
  })();
}
```

- [ ] **Step 4: Run to verify pass + commit**

Run: `npm test -- create-indexes`
Expected: PASS.
```bash
git add scripts/create-indexes.ts scripts/create-indexes.test.ts
git commit -m "feat: per-tenant index creation script"
```

---

### Task 18: Migration script (Sochmat → kitchenos tenant)

**Files:**
- Create: `scripts/migrate-to-kitchenos.ts`, `scripts/migrate-to-kitchenos.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `encryptSecret`, `createIndexes`.
- Produces: `migrate({ source: Db, target: Db, env })` — idempotent; creates the `sochmat` tenant, copies all docs with `tenantId`, re-keys counters, seeds `adminUsers` + superadmin.

- [ ] **Step 1: Write failing test (core copy + isolation + idempotency)**

`scripts/migrate-to-kitchenos.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { withMemoryMongo } from "../test/setup-mongo";
import { migrate } from "./migrate-to-kitchenos";

const env = {
  ADMIN_USER: "admin", ADMIN_PASSWORD: "ap",
  SHOP_USER: "shop", SHOP_PASSWORD: "sp",
  SUPERADMIN_EMAIL: "root@k.com", SUPERADMIN_PASSWORD: "rp",
  PRINT_AGENT_TOKEN: "tok", KITCHENOS_SECRET_KEY: Buffer.alloc(32).toString("base64"),
};

describe("migrate", () => {
  it("copies docs under the sochmat tenant and is idempotent", async () => {
    const src = await withMemoryMongo();
    const tgt = await withMemoryMongo();
    await src.db.collection("menuItems").insertMany([{ name: "Burger" }, { name: "Coke" }]);
    await src.db.collection("orders").insertOne({ orderNumber: "SO-1" });

    await migrate({ source: src.db, target: tgt.db, env });
    const tenant = await tgt.db.collection("tenants").findOne({ slug: "sochmat" });
    expect(tenant).toBeTruthy();
    const items = await tgt.db.collection("menuItems").find({}).toArray();
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.tenantId === String(tenant!._id))).toBe(true);
    expect(await tgt.db.collection("adminUsers").countDocuments()).toBe(3); // admin, shop, super

    await migrate({ source: src.db, target: tgt.db, env }); // idempotent
    expect(await tgt.db.collection("menuItems").countDocuments()).toBe(2);

    await src.cleanup(); await tgt.cleanup();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- migrate-to-kitchenos`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`scripts/migrate-to-kitchenos.ts` — `migrate({source,target,env})`:
- Upsert the `sochmat` tenant (find by slug; if exists, reuse its `_id`). Populate branding/location/compliance/zones from constants (hard-code the current Sochmat values: coords from `src/helpers/distance.ts`, GST/FSSAI/address/phone from print-agent `.env`, zones from `src/lib/societies.ts`), and `integrations.printAgentToken = env.PRINT_AGENT_TOKEN`.
- For each tenant-scoped collection present in `source`, copy docs into `target` adding `tenantId`. Skip a collection if target already has docs for that tenant (idempotency). Re-key `counters` `_id`s to `"<tenantId>:..."`.
- Seed `adminUsers`: `{tenantId, email: env.ADMIN_USER, role:"kitchen-admin", passwordHash: hash(env.ADMIN_PASSWORD)}`, the `shop` equivalent, and `{tenantId:null, email: env.SUPERADMIN_EMAIL, role:"superadmin", passwordHash: hash(env.SUPERADMIN_PASSWORD)}` — each upserted by unique key.
- Call `createIndexes(target)` at the end.
- A standalone runner (guarded by `process.argv[1]`) opens two `MongoClient`s: source = `MONGODB_URI` DB `Sochmat`, target = DB `kitchenos`, reads `env` from `process.env`. **Never writes to source.**

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- migrate-to-kitchenos`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-to-kitchenos.ts scripts/migrate-to-kitchenos.test.ts
git commit -m "feat: idempotent Sochmat -> kitchenos migration"
```

---

### Task 19: Docs — dev subdomains, env, run order

**Files:**
- Modify: `README.md` (create a short `docs/MULTITENANCY.md` if README is large), `tools/kot-print-agent/README.md`

**Interfaces:**
- Produces: developer instructions.

- [ ] **Step 1: Write the docs**

Document: required env (`ROOT_DOMAIN`, `MONGODB_DB=kitchenos`, `KITCHENOS_SECRET_KEY` generation via `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, `SUPERADMIN_EMAIL/PASSWORD`); local subdomains (`sochmat.localhost:3000`, `admin.localhost:3000`); run order (`npm run migrate:kitchenos` once, then `npm run dev`); print agent now uses its tenant's `printAgentToken` and a tenant-subdomain `SERVER_URL` (e.g. `https://sochmat.<root>`).

- [ ] **Step 2: Commit**

```bash
git add README.md docs/MULTITENANCY.md tools/kot-print-agent/README.md
git commit -m "docs: multi-tenant dev setup, env, and run order"
```

---

### Task 20: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Typecheck + production build**

Run: `npx tsc --noEmit && npm run build`
Expected: clean build, no type errors.

- [ ] **Step 3: Manual end-to-end smoke (documented)**

After `npm run migrate:kitchenos` against a dev DB: start `npm run dev`; verify `sochmat.localhost:3000` storefront loads menu; `sochmat.localhost:3000/admin/login` logs in the migrated kitchen-admin; `admin.localhost:3000/admin/login` logs in the superadmin; a cross-tenant cookie is rejected; placing an order writes an order with `tenantId` and a per-tenant KOT number.

- [ ] **Step 4: Final commit (if any docs/fixups)**

```bash
git add -A
git commit -m "chore: tenancy foundation verification fixups"
```

---

## Self-Review

**Spec coverage:**
- New DB `kitchenos` → Task 6, migration Task 18. ✓
- `tenants` collection + secrets → Tasks 5, 8, 17, 18. ✓
- Subdomain resolution, no DB in middleware → Tasks 2, 7, 12. ✓
- `tenantId` on all 12 collections + scoped accessor → Tasks 9, 14, 15; counters Task 10; settings per-tenant Tasks 14/15. ✓
- Auth refactor (adminUsers, scrypt, roles, tenant-bound session) → Tasks 3, 11, 13; gating Task 12. ✓
- Customers per-tenant → unique index Task 17, users refactor Task 14. ✓
- Migration idempotent, old DB untouched → Task 18. ✓
- Print per-tenant token → Task 16. ✓
- scrypt (no bcrypt) → Task 3. ✓
- Error handling (unknown/suspended/missing tenant) → `TenantError` Task 8, mapper Task 14, middleware Task 12. ✓
- Testing strategy (unit + isolation + auth + migration) → covered across tasks. ✓

**Placeholder scan:** Route-refactor tasks (14, 15) describe the exact transformation and the consume/produce interfaces; the repeated pattern is shown fully in Task 14 step 1–2 and applied per file — no "similar to" hand-waving for novel code. No TBD/TODO remain.

**Type consistency:** `Session` shape is defined in Task 11 and consumed identically in Tasks 12/13. `forTenant` method names (`find/findOne/insertOne/updateOne/...`) are consistent across Tasks 9, 14, 15. `getTenantId`/`TenantError` consistent across Tasks 8/14. Counter names `nextKotNumber/nextBillNumber(tenantId)` consistent Tasks 10/14/16.
