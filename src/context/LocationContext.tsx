"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string;
  timestamp?: number;
}

const STORAGE_KEY = "sochmat_user_location";

interface LocationContextType {
  location: UserLocation | null;
  setLocation: (loc: UserLocation | null) => void;
}

const LocationContext = createContext<LocationContextType | undefined>(
  undefined
);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<UserLocation | null>(null);
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

  return (
    <LocationContext.Provider value={{ location, setLocation }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useLocation() {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
