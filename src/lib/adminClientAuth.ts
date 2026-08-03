"use client";

import { useSyncExternalStore } from "react";
import type { AdminRole } from "./useAdminRole";

/**
 * Client-side reading of the admin login marker in localStorage.
 *
 * Three states, and the distinction matters: `undefined` means "not read yet"
 * (the server render and the hydration pass that matches it), `null` means
 * "read, and there is no token". Collapsing the two logs people out on reload —
 * useSyncExternalStore serves the server snapshot for the first client render,
 * so any effect that redirects on a falsy token fires before localStorage has
 * ever been consulted.
 *
 * This is UI sugar only. The real gate is the signed httpOnly `admin_session`
 * cookie enforced in src/middleware.ts.
 */
export type AdminToken = string | null | undefined;

const subscribe = () => () => {};
const getSnapshot = (): AdminToken =>
  typeof window === "undefined"
    ? undefined
    : window.localStorage.getItem("adminToken");
const getServerSnapshot = (): AdminToken => undefined;

export function useAdminToken(): AdminToken {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Where the inventory console should send this visitor, or null to stay put.
 * Pure so the reload behaviour is testable without a DOM.
 */
export function inventoryGateRedirect(
  token: AdminToken,
  role: AdminRole | null,
): string | null {
  // Still hydrating — nothing has been read, so nothing can be concluded.
  if (token === undefined) return null;
  if (!token) return "/admin/login";
  // The shop role is scoped to Menu and Orders in the admin console; it has no
  // business in inventory. Send it back to where it belongs.
  if (role === "shop") return "/admin/orders";
  return null;
}
