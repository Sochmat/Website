"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { User } from "@/lib/types";

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  /** Re-pull the signed-in user from the server. */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

/** Referral code captured from a `?ref=` link, sent at the next registration. */
const REF_KEY = "sochmat_ref";

/**
 * One-time purge of the pre-API localStorage. Identity now comes from
 * `/api/users/me` alone, so the old `user`/`userToken` pair is not merely
 * redundant — it is the thing that let the UI claim a session the server had
 * already rejected.
 *
 * The whole store is cleared rather than those two keys, so no forgotten
 * key survives the cutover. Guest state (location, society, saved addresses,
 * recent searches) goes with it; that is a known one-time cost.
 *
 * Bump the version to force another clean slate.
 */
const STORAGE_VERSION_KEY = "storage_version";
const STORAGE_VERSION = "1";

function purgeLegacyStorage() {
  try {
    if (localStorage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return;
    localStorage.clear();
    localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
  } catch {
    // Storage disabled (private mode, blocked cookies) — nothing to purge.
  }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me", { cache: "no-store" });
      // 401 is the ordinary signed-out answer, not an error.
      if (!res.ok) {
        setUser(null);
        return;
      }
      const data = await res.json();
      setUser(data?.success && data.user ? (data.user as User) : null);
    } catch {
      // A network blip resolves to signed-out rather than a retry loop: the
      // login popup is recoverable, an indefinite loading gate is not.
      setUser(null);
    }
  }, []);

  // Effects only run on the client, so `localStorage` and `fetch` are safe here
  // without a `window` guard.
  useEffect(() => {
    // Purge before the first read so nothing downstream sees stale state.
    purgeLegacyStorage();
    let cancelled = false;
    void (async () => {
      await fetchCurrentUser();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCurrentUser]);

  // Capture a `?ref=` referral code from the landing URL so registration can
  // attribute it, even if the user signs up later in the session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const ref = new URLSearchParams(window.location.search)
        .get("ref")
        ?.trim()
        .toUpperCase();
      if (ref) localStorage.setItem(REF_KEY, ref);
    } catch {
      // ignore
    }
  }, []);

  const logout = useCallback(async () => {
    // Drop the server session first. Clearing local state on a request that
    // then fails would show a signed-out UI over a session still alive on the
    // server — the same split-brain this API removes.
    try {
      await fetch("/api/users/logout", { method: "POST" });
    } catch {
      // Fall through: a session we cannot reach is one we should stop showing.
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      refresh: fetchCurrentUser,
      logout,
      isAuthenticated: !!user,
      isLoading,
    }),
    [user, isLoading, fetchCurrentUser, logout],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser must be used within UserProvider");
  }
  return ctx;
}
