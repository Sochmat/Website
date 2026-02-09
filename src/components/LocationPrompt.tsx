"use client";

import { useEffect, useState } from "react";
import { useLocation } from "@/context/LocationContext";
import { getCurrentLocation } from "@/helpers/currentLocation";

const STORAGE_KEY = "sochmat_location_prompt";

export default function LocationPrompt() {
  const { setLocation } = useLocation();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const status = localStorage.getItem(STORAGE_KEY);
    if (status) return;
    const timer = setTimeout(() => setOpen(true), 5000);
    return () => clearTimeout(timer);
  }, [mounted]);

  const handleAllow = async () => {
    try {
      const { lat, lng, address, pincode } = await getCurrentLocation();
      setLocation({ lat, lng, address, pincode, timestamp: Date.now() });
      localStorage.setItem(STORAGE_KEY, "allowed");
      setOpen(false);
    } catch {
      localStorage.setItem(STORAGE_KEY, "dismissed");
      setOpen(false);
    }
  };

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "dismissed");
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-[340px] p-5 relative">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-[#111] pr-8 mt-1">
          Allow location access
        </h2>
        <p className="text-sm text-gray-600 mt-2 leading-relaxed">
          We need your location to see if delivery is available at your
          location.
        </p>
        <button
          type="button"
          onClick={handleAllow}
          className="w-full mt-6 py-3 rounded-xl bg-[#f56215] text-white font-semibold hover:bg-[#e55510] transition-colors"
        >
          Allow
        </button>
      </div>
    </div>
  );
}
