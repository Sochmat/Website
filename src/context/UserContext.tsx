"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from "react";
import { User } from "@/lib/types";

interface UserContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const STORAGE_KEY = "user";
const TOKEN_KEY = "userToken";
/** Referral code captured from a `?ref=` link, sent at the next registration. */
const REF_KEY = "sochmat_ref";

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsLoading(false);
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as User;
        setUserState(parsed);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const setUser = (newUser: User | null) => {
    setUserState(newUser);
    if (typeof window === "undefined") return;
    if (newUser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    } else {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  };

  const logout = () => {
    setUser(null);
    // Drop the httpOnly session too — clearing localStorage alone would leave the
    // server still treating this browser as signed in.
    void fetch("/api/users/logout", { method: "POST" }).catch(() => {});
  };

  const value = useMemo(
    () => ({
      user,
      setUser,
      logout,
      isAuthenticated: !!user,
      isLoading,
    }),
    [user, isLoading]
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
