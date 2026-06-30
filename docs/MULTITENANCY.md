# KitchenOS — Multi-tenancy Dev Guide

## What changed

The app was originally a single-tenant deployment for Sochmat. It is now **KitchenOS**: a multi-tenant platform where every kitchen runs at its own subdomain (`<slug>.<ROOT_DOMAIN>`), all sharing a single MongoDB database (`kitchenos`). Every document in every tenant-scoped collection carries a `tenantId` field; middleware (`src/middleware.ts`) reads the `Host` header, resolves the tenant via `src/lib/subdomain.ts`, and injects `x-tenant-scope` / `x-tenant-slug` headers for downstream route handlers. Admin authentication is now DB-backed: credentials live in the `adminUsers` collection and sessions are HMAC-signed httpOnly cookies (no more hardcoded env-var passwords at runtime).

---

## Required env vars

### Runtime (needed every time the app starts)

| Var | Required | Notes |
|-----|----------|-------|
| `MONGODB_URI` | Yes | MongoDB connection string; defaults to `mongodb://localhost:27017` |
| `MONGODB_DB` | Yes (default: `kitchenos`) | Database name; the `.env.example` sets this |
| `ROOT_DOMAIN` | Yes | Bare domain without scheme or port. Use `localhost` in dev, your apex domain in prod (e.g. `kitchenos.com`). Defaults to `localhost` if unset. |
| `KITCHENOS_SECRET_KEY` | Yes | 32-byte AES-GCM key, base64-encoded. Used to encrypt tenant secrets stored in the DB. Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ADMIN_SESSION_SECRET` | Yes | Arbitrary secret string used to sign admin session cookies (HMAC-SHA-256). If unset the app falls back to `RAZORPAY_KEY_SECRET` or `ADMIN_PASSWORD`, but setting it explicitly is strongly recommended. |
| `UPSTASH_REDIS_REST_URL` | Recommended | Upstash REST URL for rate limiting. If absent, rate limiting fails open. |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | Upstash REST token (pair with above). |
| `RAZORPAY_KEY_ID` | For payments | Razorpay integration key. |
| `RAZORPAY_KEY_SECRET` | For payments | Razorpay integration secret. |

### Migration-only inputs (read once by `npm run migrate:kitchenos`)

These env vars are consumed by the migration script to seed the Sochmat tenant's admin users and print token. They are **not used at runtime** after migration completes.

| Var | Purpose |
|-----|---------|
| `SUPERADMIN_EMAIL` | Email for the platform super-admin account (no tenant) |
| `SUPERADMIN_PASSWORD` | Password for the super-admin account |
| `ADMIN_USER` | Email for Sochmat's `kitchen-admin` account |
| `ADMIN_PASSWORD` | Password for the Sochmat kitchen-admin |
| `SHOP_USER` | Email for Sochmat's `shop` (cashier) account |
| `SHOP_PASSWORD` | Password for the Sochmat shop account |
| `PRINT_AGENT_TOKEN` | Bearer token for the Sochmat print agent; stored as `integrations.printAgentToken` on the tenant record |

---

## Local dev with subdomains

Modern browsers resolve `*.localhost` automatically — no `/etc/hosts` editing needed.

| URL | What you reach |
|-----|----------------|
| `http://sochmat.localhost:3000` | Sochmat storefront |
| `http://sochmat.localhost:3000/admin` | Sochmat kitchen-admin panel |
| `http://admin.localhost:3000/admin` | Super-admin (cross-tenant) panel |

The subdomain parser (`src/lib/subdomain.ts`) maps:
- `admin.<ROOT_DOMAIN>` → `kind: "super"` (super-admin scope)
- `<slug>.<ROOT_DOMAIN>` → `kind: "tenant"` with `slug`
- bare `<ROOT_DOMAIN>` → `kind: "root"`

**Reserved slugs** (cannot be used as tenant slugs): `admin`, `www`, `api`, `app`, `static`, `assets`.

---

## Run order

1. **Set env vars** — copy `.env.example` to `.env.local` and fill in the values above (both runtime and migration-only for first run).

2. **Run the migration once** (existing Sochmat deployment only):

   ```bash
   npm run migrate:kitchenos
   ```

   This script:
   - Reads from the `Sochmat` MongoDB database (source) and writes into `kitchenos` (target).
   - Upserts the `sochmat` tenant record.
   - Copies all tenant-scoped collections (`orders`, `menuItems`, `categories`, etc.) and stamps each document with `tenantId`.
   - Seeds `adminUsers` for the three accounts (super-admin, kitchen-admin, shop).
   - Creates all required indexes (calls `createIndexes` internally).
   - Is **idempotent**: safe to re-run; it skips collections that already have tenant-stamped docs.

   For a **fresh install** (no existing Sochmat data), the migration still seeds the tenant record, admin users, and indexes — the collection-copy step simply finds nothing and skips.

3. **Start the dev server**:

   ```bash
   npm run dev
   ```

   The app is now available at `http://<slug>.localhost:3000`.

### Standalone index creation

If you need to rebuild indexes independently (e.g. after a schema change):

```bash
npm run create-indexes
```

This script uses `MONGODB_URI` and `MONGODB_DB` and is safe to run against a running database.

---

## Auth / login

Admins authenticate at:

```
http://<tenant-slug>.localhost:3000/admin/login   # kitchen-admin or shop role
http://admin.localhost:3000/admin/login            # superadmin only
```

The login form accepts an **email** field (the legacy `user` field is also accepted for backward compatibility). On success, the server sets an `admin_session` httpOnly cookie containing an HMAC-signed session token.

### Roles

| Role | Scope | Access |
|------|-------|--------|
| `superadmin` | Platform-wide (no tenant) | `admin.localhost` only |
| `kitchen-admin` | One tenant | Full admin panel for that tenant's subdomain |
| `shop` | One tenant | Restricted shop/cashier view for that tenant |

Session tokens are scoped: a `kitchen-admin` token issued at `sochmat.localhost` is rejected at any other subdomain. A `superadmin` token is rejected at all tenant subdomains.

Sessions last **12 hours**.

---

## Print agent (per-tenant)

Each kitchen's print agent authenticates using that tenant's `integrations.printAgentToken`, which is stored in the `tenants` collection. The server resolves the tenant solely from the Bearer token — there is no `SERVER_URL` path prefix for tenant selection.

The Sochmat agent continues to work without reconfiguration because the migration seeds its token from the `PRINT_AGENT_TOKEN` env var.

### `.env` for the print agent

```
SERVER_URL=http://sochmat.localhost:3000   # dev  — use https://sochmat.<ROOT_DOMAIN> in prod
PRINT_AGENT_TOKEN=<value from tenant record integrations.printAgentToken>
PRINTER_NAME=POS-80
```

In production point `SERVER_URL` at the full tenant subdomain URL (e.g. `https://sochmat.kitchenos.com`). The `/api/print/kot` and `/api/print/bill` endpoints look up the tenant from the token, so the URL only needs to reach the server — no special path is required.

See `tools/kot-print-agent/README.md` for the full setup guide.

---

## What is NOT built yet (future)

- **Super-admin dashboard UI** — the `admin.localhost` subdomain resolves and the session is enforced by middleware, but no UI pages exist at that scope yet.
- **Per-tenant Razorpay wiring** — the `integrations.razorpay` field is defined on the tenant schema but the payment flow still reads global env vars. Per-tenant key injection is a future task.
- **Tenant provisioning API** — new tenants must be inserted into the `tenants` collection manually or via a future admin UI.
