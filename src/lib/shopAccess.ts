// What the `shop` role is allowed to reach.
//
// The role split used to live only in the browser: the sidebar hid admin-only
// links and AdminLayout redirected a shop session away from admin pages. That
// is presentation, not access control — the session cookie itself was accepted
// by every /api/admin and /api/inventory route, so anything the UI merely hid
// was still a fetch away.
//
// This module is the server-side answer, applied in src/middleware.ts. It is
// an allowlist, deliberately: a new admin endpoint is then closed to the shop
// role by default, and only opens once someone adds it here on purpose.
//
// Pure data and string matching only, so it is safe to import from Edge
// middleware alongside adminAuth.

/** Pages the shop role may open. Anything else under /admin redirects. */
export const SHOP_PAGES = [
  "/admin/menu",
  "/admin/orders",
  "/admin/add-stock",
] as const;

/** Where a shop session is sent when it asks for a page it may not have. */
export const SHOP_HOME = "/admin/orders";

/**
 * API paths the shop role may call, and with which methods.
 *
 * Matching is by exact path or path prefix, so `/api/admin/menu` also covers
 * `/api/admin/menu/<id>`. Methods are listed explicitly rather than defaulting
 * to read-only, because two of these surfaces are genuinely written to by the
 * kitchen: order status moves through PATCH, and marking an item sold out is a
 * PUT.
 *
 * Matching is on path and method only. Where a single endpoint covers more
 * than one kind of work and the distinction lives in the request body, the
 * check has to happen in the route handler instead — /api/inventory/
 * stock-additions is the one such case: it takes both raw-material deliveries
 * and production batches, and only the latter is kitchen work.
 *
 * Store and delivery status are absent on purpose, not by oversight:
 * /api/admin/store-status and /api/admin/delivery-status are POST-only writes
 * behind the admin-only toggles, and StoreStatusContext reads the state from
 * the public /api/store-status instead. Leaving them out of this list is what
 * makes those toggles admin-only in fact rather than merely hidden.
 */
export const SHOP_API: Readonly<Record<string, readonly string[]>> = {
  "/api/admin/logout": ["POST"],
  // Read for the list; PUT for the sold-out toggle. See the note in
  // middleware.ts on why this is not narrowed further here.
  "/api/admin/menu": ["GET", "PUT"],
  // Read-only: the shop sees category and add-on names on each menu row, but
  // the tabs that manage them are admin-only.
  "/api/admin/categories": ["GET"],
  "/api/admin/addon-categories": ["GET"],
  "/api/admin/orders": ["GET", "PATCH"],
  // The Add Stock screen: list what the kitchen makes, record a batch of it.
  "/api/inventory/production-items": ["GET"],
  "/api/inventory/stock-additions": ["POST"],
};

/** True when `pathname` is `base` or sits underneath it. */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(base + "/");
}

/** Whether the shop role may open this page. */
export function shopMayOpenPage(pathname: string): boolean {
  return SHOP_PAGES.some((page) => isUnder(pathname, page));
}

/**
 * Whether the shop role may make this API call.
 *
 * The longest matching prefix wins, so a more specific entry can be added
 * later to override a broader one without depending on key order.
 */
export function shopMayCallApi(pathname: string, method: string): boolean {
  let matched: readonly string[] | null = null;
  let matchedLength = -1;
  for (const [base, methods] of Object.entries(SHOP_API)) {
    if (isUnder(pathname, base) && base.length > matchedLength) {
      matched = methods;
      matchedLength = base.length;
    }
  }
  return matched !== null && matched.includes(method.toUpperCase());
}
