# Tenancy Foundation (KitchenOS — Multi-Tenant SaaS, Spec 1 of N)

**Date:** 2026-06-30
**Status:** Approved (design)
**Owner:** Harsh

## Context

The app is today a single-tenant food-ordering site for one cloud kitchen
("Sochmat"). We are commoditising it into **KitchenOS**, a multi-tenant SaaS
where many cloud kitchens are onboarded, each with its own admin panel and its
own customer storefront, plus a super-admin dashboard for the platform owner.

This is the first of several specs. It builds **only** the foundation that
every other piece depends on. The app must keep working end-to-end as the
`sochmat` tenant after this spec lands.

### Roadmap (this spec = Spec 1)

1. **Tenancy Foundation** — *this document.*
2. Super-Admin Dashboard (`admin.<root>`): provision/suspend kitchens, cross-tenant overview.
3. Per-Tenant Storefront & Branding: storefront reads tenant identity instead of hard-coded constants.
4. Per-Tenant Integrations: Razorpay & Petpooja per kitchen; SMTP/Maps/Redis shared with override; per-tenant print-agent routing.
5. (Later) Self-serve signup + billing.

### Foundational decisions (locked)

- **Tenant routing:** subdomain. `kitchenname.<root>` for storefront/admin; `admin.<root>` for super-admin.
- **Data isolation:** shared database, `tenantId` on every document and query.
- **Onboarding:** super-admin provisions kitchens (no self-serve in Spec 1).
- **New database:** `kitchenos` (the existing `Sochmat` DB is retained read-only as a migration source / rollback).
- **Customers:** per-tenant. A phone number is a distinct customer per kitchen.
- **Password hashing:** Node built-in `crypto.scrypt` (no native build — EC2/Docker safe). **Not** native `bcrypt`.

## Goals

- A `tenants` registry collection that holds each kitchen's identity, branding, location, delivery zones, and (schema-only for now) integration config.
- Subdomain → tenant resolution available to every API route and server component, with no DB hit inside middleware.
- `tenantId` on all 12 existing collections; a scoped accessor so a handler cannot forget the tenant filter.
- DB-backed admin auth (`adminUsers`) with roles `superadmin` / `kitchen-admin` / `shop`, replacing env credentials. Sessions bound to a tenant.
- A one-time migration that moves existing Sochmat data into the new `kitchenos` DB as the first tenant, with zero data loss and the old DB left intact.

## Non-Goals (deferred to later specs)

- Super-admin dashboard UI (Spec 2).
- Storefront actually rendering per-tenant branding/zones (Spec 3) — Spec 1 stores the data and wires resolution, but the storefront still visually reads as Sochmat until Spec 3.
- Actually calling per-tenant Razorpay/Petpooja/SMTP or per-tenant print routing (Spec 4) — Spec 1 only adds the config **schema** and continues to use platform env values as the effective config for the `sochmat` tenant.
- Self-serve signup, billing, custom domains.

## Data Model

### New collection: `tenants`

```ts
{
  _id: ObjectId,
  slug: string,            // subdomain label, unique, lowercase kebab (e.g. "biryani-hub")
  name: string,            // display name
  legalName: string,
  status: "active" | "suspended",
  branding: {
    logoUrl: string,
    primaryColor: string,  // hex
    accentColor: string,
  },
  contact: { phone: string, email: string, address: string },
  compliance: { gstNo: string, fssaiNo: string },
  location: { lat: number, lng: number, serviceRadiusKm: number },
  deliveryZones: Array<{    // replaces hard-coded src/lib/societies.ts
    id: string, name: string, sector: string, towers: string[],
  }>,
  integrations: {           // schema now; wired in Spec 4. Secrets encrypted at rest.
    razorpay: { keyId: string, keySecretEnc: string, enabled: boolean } | null,
    petpooja: { appKey: string, appSecretEnc: string, accessToken: string, restId: string, enabled: boolean } | null,
    smtp: { host, port, user, passEnc, from, secure, authMethod } | null,  // null -> platform default
    printAgentToken: string,   // per-tenant; print agent authenticates with this
  },
  createdAt: Date,
  updatedAt: Date,
}
```

Indexes: unique `{ slug: 1 }`. Reserved slugs that may never be a tenant:
`admin`, `www`, `api`, `app`, `static`, `assets`.

**Secret handling:** `keySecretEnc`, `appSecretEnc`, `passEnc` are AES-256-GCM
encrypted with a platform key from env (`KITCHENOS_SECRET_KEY`). They are never
included in any response sent to a browser. A small `src/lib/secrets.ts`
(`encryptSecret` / `decryptSecret`) wraps this.

### New collection: `adminUsers`

```ts
{
  _id: ObjectId,
  tenantId: ObjectId | null,        // null only for superadmin
  email: string,                    // login identifier
  passwordHash: string,             // scrypt: "scrypt$N$r$p$saltB64$hashB64"
  role: "superadmin" | "kitchen-admin" | "shop",
  name: string,
  createdAt: Date,
  updatedAt: Date,
}
```

Indexes: unique `{ tenantId: 1, email: 1 }`; partial unique `{ email: 1 }` where
`role === "superadmin"`.

### Existing collections — add `tenantId`

All 12 get a `tenantId: ObjectId`. Uniqueness and hot-path indexes become
compound on `tenantId`:

| Collection | Change |
|---|---|
| `users` | `+tenantId`; unique `{tenantId, phone}` (customers are per-tenant) |
| `orders` | `+tenantId`; unique `{tenantId, orderNumber}`; index `{tenantId, status, kotPrinted}` (print queue) |
| `menuItems` | `+tenantId`; index `{tenantId, category}` |
| `categories` | `+tenantId` |
| `coupons` | `+tenantId`; unique `{tenantId, code}` |
| `subscriptions` | `+tenantId` |
| `mealCards` | `+tenantId` |
| `categoryTiles` | `+tenantId` |
| `bannerSlides` | `+tenantId` |
| `otps` | `+tenantId`; TTL index unchanged |
| `counters` | `_id` re-keyed to `"<tenantId>:kot:YYYY-MM-DD"` and `"<tenantId>:bill:global"` |
| `settings` | `+tenantId`; lookups become `{tenantId, key}` (e.g. store/delivery toggles per tenant) |

## Tenant Resolution

### Middleware (`src/middleware.ts`) — no DB access

1. Parse the subdomain from the `Host` header against the configured root domain
   (`ROOT_DOMAIN` env, e.g. `kitchenos.app`; in dev, `localhost`).
2. Cases:
   - `admin.<root>` → super-admin context. Set header `x-tenant-scope: super`.
   - `<slug>.<root>` → set `x-tenant-slug: <slug>`.
   - bare root / `www` → marketing/redirect (out of scope here; pass through).
3. Admin gating (existing logic, extended): for `/admin` and `/api/admin` paths,
   verify the signed session cookie **and**:
   - super-admin routes require `x-tenant-scope: super` and `session.role === "superadmin"`.
   - tenant admin routes require `session.tenantSlug === x-tenant-slug`.

   This comparison uses values already inside the signed cookie + the host —
   **no DB call in middleware**, so it stays light and runtime-portable.

### Server helper (`src/lib/tenant.ts`)

- `getTenant(): Promise<Tenant>` — reads `x-tenant-slug` from request headers,
  looks the tenant up in `tenants`, and returns it. Backed by an **in-memory LRU
  cache with a short TTL (e.g. 30s)** keyed by slug, so repeated requests don't
  hammer Mongo. Throws/redirects on unknown or suspended tenant.
- `getTenantId(): Promise<ObjectId>` — convenience used by data access.
- Cache is invalidated on tenant update (Spec 2 mutations call `invalidateTenant(slug)`).

### Local development

Modern browsers resolve `*.localhost` to `127.0.0.1` automatically, so
`biryani-hub.localhost:3000` and `admin.localhost:3000` work with no hosts-file
edits. `ROOT_DOMAIN=localhost` in dev. Documented in the README.

## Data Isolation

A scoped accessor prevents "forgot the tenant filter" bugs:

```ts
// src/lib/tenantDb.ts
const col = await forTenant(tenantId);     // resolves once per request
col.orders.find(query)                     // auto-merges { tenantId } into filter
col.orders.insertOne(doc)                  // auto-sets doc.tenantId
col.counters.next("kot")                   // tenant-scoped counter key
```

- `forTenant(tenantId)` returns wrappers over the tenant-scoped collections that
  inject `tenantId` into every `find/findOne/updateMany/deleteMany` filter and
  into every `insertOne/insertMany` document.
- Direct `db.collection(...)` use in tenant-scoped routes is migrated to
  `forTenant(...)`. The `tenants` and `adminUsers` collections are platform-level
  and accessed directly (they are not tenant-scoped).
- The print routes (`/api/print/*`) resolve the tenant from the **print-agent
  token** (each tenant has its own `integrations.printAgentToken`) and filter the
  queue by that tenant — replacing the single shared `PRINT_AGENT_TOKEN`. (Full
  per-tenant print rollout is Spec 4; Spec 1 makes the token tenant-resolvable so
  the existing Sochmat agent keeps working with its own token.)

## Authentication

### Login

- `POST /api/admin/login` resolves scope from the host:
  - on `admin.<root>`: authenticate a `superadmin` (`tenantId: null`).
  - on `<slug>.<root>`: look up `adminUsers` by `{ tenantId, email }` for that tenant.
- Password verified with `crypto.scrypt` (constant-time compare via
  `crypto.timingSafeEqual`).
- Session cookie (existing HMAC-signed `admin_session` in `src/lib/adminAuth.ts`)
  payload extended to: `{ userId, tenantId, tenantSlug, role, exp }`. 12h TTL
  unchanged. Cookie remains httpOnly; because it is set per-subdomain it is
  already partitioned by tenant, and the middleware tenant-slug check enforces it
  server-side regardless.

### Roles

- `superadmin` — platform owner; only valid on `admin.<root>`; no tenant scope.
- `kitchen-admin` — full access within their tenant's admin panel.
- `shop` — in-store staff; keeps the existing path restriction
  (`/admin/orders`, `/admin/menu`) but scoped to their tenant.

### Password hashing util (`src/lib/password.ts`)

- `hashPassword(plain): string` and `verifyPassword(plain, stored): boolean`
  using `crypto.scrypt` (N=16384, r=8, p=1, 16-byte salt). No native deps.

## Migration

One-time, idempotent script: `scripts/migrate-to-kitchenos.ts`
(`npm run migrate:kitchenos`).

1. Connect to old `Sochmat` DB (source) and new `kitchenos` DB (target).
2. Create the **Sochmat tenant** (slug `sochmat`) populating:
   - branding/contact/compliance/location from current constants
     (`src/helpers/distance.ts` coords, print-agent `.env` GST/FSSAI/address/phone),
   - `deliveryZones` from `src/lib/societies.ts`,
   - `integrations.printAgentToken` from the current `PRINT_AGENT_TOKEN`.
3. For every source collection, copy documents into the target DB with
   `tenantId = <sochmatTenantId>` added; re-key `counters` `_id`s.
4. Create `adminUsers`:
   - `kitchen-admin` and `shop` from current `ADMIN_USER/ADMIN_PASSWORD` and
     `SHOP_USER/SHOP_PASSWORD` (hashed with scrypt), under the Sochmat tenant.
   - a `superadmin` for the platform owner (credentials provided via env at
     migration time: `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`).
5. Create all indexes listed above.
6. Idempotent: re-running detects the existing `sochmat` tenant and skips/updates
   rather than duplicating.
7. The old `Sochmat` DB is never written to.

## Error Handling

- Unknown subdomain / no matching tenant → storefront returns a 404 "kitchen not
  found" page; APIs return `404 { success:false, message:"Unknown tenant" }`.
- Suspended tenant (`status:"suspended"`) → storefront shows a "temporarily
  unavailable" page; order/checkout APIs reject with `403`.
- Missing `x-tenant-slug` on a tenant-scoped API (e.g. direct call without host)
  → `400 { success:false, message:"Tenant could not be resolved" }`.
- `getTenant()` cache miss falls through to Mongo; Mongo error → `503`.

## Testing

- **Unit:** subdomain parsing (apex/www/admin/slug/multi-level host, port,
  unknown root); `forTenant` filter/insert injection; `scrypt`
  hash/verify round-trip and rejection of wrong password; secret encrypt/decrypt.
- **Integration:** two seeded tenants; assert tenant A's API never returns tenant
  B's orders/menu/users; per-tenant `orderNumber`/coupon-code uniqueness;
  per-tenant counter sequences are independent.
- **Auth:** kitchen-admin of A cannot authenticate against B; superadmin only on
  `admin.` host; `shop` path restriction still holds.
- **Migration:** run against a copy of Sochmat data; assert document counts match
  source, every migrated doc has the tenantId, counters continue from prior
  sequence, and old DB is unchanged.

## Rollout / Backward Compatibility

- The app runs as the single `sochmat` tenant after migration; customer-facing
  behavior is unchanged until Spec 3.
- `MONGODB_DB` switches to `kitchenos`; keep the old value documented for
  rollback.
- New env: `ROOT_DOMAIN`, `KITCHENOS_SECRET_KEY`, `SUPERADMIN_EMAIL`,
  `SUPERADMIN_PASSWORD` (migration only). `ADMIN_USER/PASSWORD`,
  `SHOP_USER/PASSWORD`, and `PRINT_AGENT_TOKEN` become migration inputs and are
  no longer read at runtime once `adminUsers`/per-tenant tokens exist.
- Existing Sochmat print agent keeps working: its token now resolves to the
  Sochmat tenant.
