"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";

interface StoreStatusContextType {
  open: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  setOpen: (value: boolean) => Promise<boolean>;
}

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

const StoreStatusContext = createContext<StoreStatusContextType | undefined>(
  undefined,
);

export function StoreStatusProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(true);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/store-status", { cache: "no-store" });
      const data = await res.json();
      if (cancelledRef.current) return;
      if (data?.success && typeof data.open === "boolean") {
        setOpenState(data.open);
      }
    } catch (error) {
      console.error("Failed to fetch store status:", error);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  const setOpen = useCallback(
    async (value: boolean) => {
      const previous = open;
      setOpenState(value); // optimistic
      try {
        const res = await fetch("/api/admin/store-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ open: value }),
        });
        const data = await res.json();
        if (!data?.success) {
          setOpenState(previous);
          return false;
        }
        return true;
      } catch (error) {
        console.error("Failed to update store status:", error);
        setOpenState(previous);
        return false;
      }
    },
    [open],
  );

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
    };
  }, [refresh]);

  return (
    <StoreStatusContext.Provider value={{ open, loading, refresh, setOpen }}>
      {children}
    </StoreStatusContext.Provider>
  );
}

export function useStoreStatus() {
  const ctx = useContext(StoreStatusContext);
  if (!ctx) {
    throw new Error("useStoreStatus must be used within a StoreStatusProvider");
  }
  return ctx;
}
