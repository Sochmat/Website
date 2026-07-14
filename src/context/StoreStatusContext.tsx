"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";

interface StoreStatusContextType {
  open: boolean;
  deliveryOn: boolean;
  loading: boolean;
  /** When closed by the schedule, a label like "11:00 AM" for the reopen time. */
  opensAtLabel: string | null;
  refresh: () => Promise<void>;
  setOpen: (value: boolean) => Promise<boolean>;
  setDeliveryOn: (value: boolean) => Promise<boolean>;
}

// Short so an automatic open/close from the schedule shows on open tabs quickly.
// (The server-side 503 gate enforces immediately regardless of this cadence.)
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const StoreStatusContext = createContext<StoreStatusContextType | undefined>(
  undefined,
);

export function StoreStatusProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(true);
  const [deliveryOn, setDeliveryOnState] = useState(true);
  const [opensAtLabel, setOpensAtLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);
  const openRef = useRef(true);
  const deliveryRef = useRef(true);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    deliveryRef.current = deliveryOn;
  }, [deliveryOn]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/store-status", { cache: "no-store" });
      const data = await res.json();
      if (cancelledRef.current) return;
      if (data?.success && typeof data.open === "boolean") {
        openRef.current = data.open;
        setOpenState(data.open);
        setOpensAtLabel(
          typeof data.opensAtLabel === "string" ? data.opensAtLabel : null,
        );
      }
      if (data?.success && typeof data.delivery === "boolean") {
        deliveryRef.current = data.delivery;
        setDeliveryOnState(data.delivery);
      }
    } catch (error) {
      console.error("Failed to fetch store status:", error);
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  const setOpen = useCallback(async (value: boolean) => {
    const previous = openRef.current;
    openRef.current = value;
    setOpenState(value); // optimistic
    try {
      const res = await fetch("/api/admin/store-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open: value }),
      });
      const data = await res.json();
      if (!data?.success) {
        openRef.current = previous;
        if (!cancelledRef.current) setOpenState(previous);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to update store status:", error);
      openRef.current = previous;
      if (!cancelledRef.current) setOpenState(previous);
      return false;
    }
  }, []);

  const setDeliveryOn = useCallback(async (value: boolean) => {
    const previous = deliveryRef.current;
    deliveryRef.current = value;
    setDeliveryOnState(value); // optimistic
    try {
      const res = await fetch("/api/admin/delivery-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: value }),
      });
      const data = await res.json();
      if (!data?.success) {
        deliveryRef.current = previous;
        if (!cancelledRef.current) setDeliveryOnState(previous);
        return false;
      }
      return true;
    } catch (error) {
      console.error("Failed to update delivery status:", error);
      deliveryRef.current = previous;
      if (!cancelledRef.current) setDeliveryOnState(previous);
      return false;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh();
    const interval = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
    };
  }, [refresh]);

  const value = useMemo(
    () => ({
      open,
      deliveryOn,
      loading,
      opensAtLabel,
      refresh,
      setOpen,
      setDeliveryOn,
    }),
    [open, deliveryOn, loading, opensAtLabel, refresh, setOpen, setDeliveryOn],
  );

  return (
    <StoreStatusContext.Provider value={value}>
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
