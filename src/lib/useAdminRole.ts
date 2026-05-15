"use client";

import { useSyncExternalStore } from "react";

export type AdminRole = "admin" | "shop";

const subscribe = () => () => {};
const getSnapshot = (): AdminRole | null => {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem("adminRole");
  return stored === "admin" || stored === "shop" ? stored : null;
};
const getServerSnapshot = (): AdminRole | null => null;

export function useAdminRole(): AdminRole | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
