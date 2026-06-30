import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Guard test: fail if any API route.ts file uses raw .collection("<scoped>")
// instead of the tenant-scoped forTenant() abstraction. This prevents
// cross-tenant data leaks caused by bypassing the ScopedDb wrapper.
//
// Rule: no .collection("<scoped-name>") anywhere under src/app/api (route.ts files).
// .raw("X") is allowed for the two known admin/orders usages (they carry
// explicit tenantId in their queries) — but .collection("X") is never OK for
// tenant-scoped collections.

const SCOPED_COLLECTIONS = new Set([
  "orders",
  "menuItems",
  "categories",
  "coupons",
  "users",
  "otps",
  "settings",
  "subscriptions",
  "mealCards",
  "categoryTiles",
  "bannerSlides",
]);

function collectRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name === "route.ts") {
      results.push(fullPath);
    }
  }
  return results;
}

const API_DIR = path.resolve(__dirname, "../src/app/api");

describe("route isolation guard", () => {
  it("no route.ts file uses raw .collection() on a tenant-scoped collection", () => {
    const routeFiles = collectRouteFiles(API_DIR);
    expect(routeFiles.length).toBeGreaterThan(0); // sanity: we found files

    // Regex: matches .collection("someCollectionName")
    const RAW_COLLECTION_RE = /\.collection\(\s*["']([^"']+)["']\s*\)/g;

    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, "utf-8");
      let match: RegExpExecArray | null;
      RAW_COLLECTION_RE.lastIndex = 0;
      while ((match = RAW_COLLECTION_RE.exec(content)) !== null) {
        const collName = match[1];
        if (SCOPED_COLLECTIONS.has(collName)) {
          const relPath = path.relative(API_DIR, file);
          violations.push(`${relPath}: raw .collection("${collName}")`);
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Tenant isolation violation — replace with forTenant() ScopedDb:\n  ${violations.join("\n  ")}`
      );
    }
  });
});
