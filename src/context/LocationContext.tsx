"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import {
  distanceFromBusinessKm,
  isWithinServiceArea,
  SERVICE_RADIUS_KM,
} from "@/helpers/distance";
import {
  DEFAULT_SOCIETY,
  getSocietyById,
  type Society,
} from "@/lib/societies";
import {
  discountPercentFor,
  type SocietyDiscountMap,
} from "@/lib/societyDiscounts";

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string;
  pincode?: string;
  timestamp?: number;
}

const STORAGE_KEY = "sochmat_user_location";
const SOCIETY_KEY = "sochmat_society_id";

interface LocationContextType {
  location: UserLocation | null;
  setLocation: (loc: UserLocation | null) => void;
  distanceFromStoreKm: number | null;
  isServiceable: boolean;
  serviceRadiusKm: number;
  /** Currently selected delivery society. */
  society: Society;
  setSocietyId: (id: string) => void;
  /** Admin-configured flat discount % for the selected society (0 when none). */
  societyDiscountPercent: number;
}

const LocationContext = createContext<LocationContextType | undefined>(
  undefined
);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<UserLocation | null>(null);
  const [societyId, setSocietyIdState] = useState<string>(DEFAULT_SOCIETY.id);
  const [discounts, setDiscounts] = useState<SocietyDiscountMap>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as UserLocation;
        if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
          setLocationState(parsed);
        }
      }
    } catch {
      // ignore
    }
    try {
      const savedSociety = localStorage.getItem(SOCIETY_KEY);
      if (savedSociety) setSocietyIdState(getSocietyById(savedSociety).id);
    } catch {
      // ignore
    }
  }, [mounted]);

  // Load admin-configured per-society discounts (public, no-store).
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/society-discounts", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data?.success && data.discounts) {
          setDiscounts(data.discounts as SocietyDiscountMap);
        }
      } catch {
        // ignore — no discount is a safe default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mounted]);

  const setLocation = (loc: UserLocation | null) => {
    setLocationState(loc);
    if (typeof window === "undefined") return;
    if (loc) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const setSocietyId = (id: string) => {
    const next = getSocietyById(id);
    setSocietyIdState(next.id);
    if (typeof window !== "undefined") {
      localStorage.setItem(SOCIETY_KEY, next.id);
    }
  };

  const society = getSocietyById(societyId);
  const societyDiscountPercent = discountPercentFor(discounts, society.id);

  const distanceFromStoreKm = location
    ? distanceFromBusinessKm(location.lat, location.lng)
    : null;
  const isServiceable = location
    ? isWithinServiceArea(location.lat, location.lng)
    : false;

  const value = useMemo(
    () => ({
      location,
      setLocation,
      distanceFromStoreKm,
      isServiceable,
      serviceRadiusKm: SERVICE_RADIUS_KM,
      society,
      setSocietyId,
      societyDiscountPercent,
    }),
    [location, distanceFromStoreKm, isServiceable, society, societyDiscountPercent]
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
