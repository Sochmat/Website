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
}

const LocationContext = createContext<LocationContextType | undefined>(
  undefined
);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<UserLocation | null>(null);
  const [societyId, setSocietyIdState] = useState<string>(DEFAULT_SOCIETY.id);
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
    }),
    [location, distanceFromStoreKm, isServiceable, society]
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
