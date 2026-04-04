"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useLocation } from "@/context/LocationContext";
import { getCurrentLocation } from "@/helpers/currentLocation";
import { BUSINESS_LAT, BUSINESS_LNG } from "@/helpers/distance";
import AddAddressSheet from "./AddAddressSheet";
import type { UserAddress } from "@/lib/types";

interface SearchResult {
  address: string;
  lat: number;
  lng: number;
  pincode: string | null;
}

// Default center (business location)
const DEFAULT_CENTER: [number, number] = [BUSINESS_LAT, BUSINESS_LNG];

// Dynamically import the map to avoid SSR issues
const MapView = dynamic(() => import("./LocationMap"), { ssr: false });

interface LocationSelectorProps {
  open: boolean;
  onClose: () => void;
  editAddress?: UserAddress | null;
  onSaved?: (addr: UserAddress) => void;
}

export default function LocationSelector({
  open,
  onClose,
  editAddress: editAddressProp,
  onSaved,
}: LocationSelectorProps) {
  const { location, setLocation } = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [pinPosition, setPinPosition] = useState<[number, number]>(
    location ? [location.lat, location.lng] : DEFAULT_CENTER,
  );
  const [pinAddress, setPinAddress] = useState<string | null>(null);
  const [pinPincode, setPinPincode] = useState<string | null>(null);
  const [reversing, setReversing] = useState(false);
  const [addressSheetOpen, setAddressSheetOpen] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When opening, sync pin to editAddress > current location > default
  useEffect(() => {
    if (open) {
      if (editAddressProp && editAddressProp.lat && editAddressProp.long) {
        setPinPosition([editAddressProp.lat, editAddressProp.long]);
        setPinAddress(editAddressProp.address ?? null);
      } else if (location) {
        setPinPosition([location.lat, location.lng]);
        setPinAddress(location.address ?? null);
      } else {
        setPinPosition(DEFAULT_CENTER);
        setPinAddress(null);
      }
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, editAddressProp]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/geocode/search?q=${encodeURIComponent(query)}`,
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Reverse geocode when pin moves
  const reverseGeocode = useCallback((lat: number, lng: number) => {
    if (reverseRef.current) clearTimeout(reverseRef.current);
    setReversing(true);
    reverseRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
        const data = await res.json();
        setPinAddress(data.address ?? null);
        setPinPincode(data.pincode ?? null);
      } catch {
        setPinAddress(null);
        setPinPincode(null);
      } finally {
        setReversing(false);
      }
    }, 300);
  }, []);

  const handlePinMove = useCallback(
    (lat: number, lng: number) => {
      setPinPosition([lat, lng]);
      reverseGeocode(lat, lng);
    },
    [reverseGeocode],
  );

  const handleGPS = async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const { lat, lng, address, pincode } = await getCurrentLocation();
      setPinPosition([lat, lng]);
      setPinAddress(address ?? null);
      setLocation({ lat, lng, address, pincode, timestamp: Date.now() });
    } catch {
      const isInsecure = window.location.protocol !== "https:";
      if (isInsecure) {
        setGpsError("Location requires HTTPS. Use search instead.");
      } else {
        setGpsError("Could not get location. Please allow permission.");
      }
      setTimeout(() => setGpsError(null), 4000);
    } finally {
      setGpsLoading(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    setPinPosition([result.lat, result.lng]);
    setPinAddress(result.address);
    setPinPincode(result.pincode);
    setQuery("");
    setResults([]);
  };

  const handleAddressSaved = (addr: UserAddress) => {
    setLocation({
      lat: addr.lat,
      lng: addr.long,
      address: addr.address,
      pincode: addr.pincode,
      timestamp: Date.now(),
    });
    setAddressSheetOpen(false);
    onSaved?.(addr);
    onClose();
    setQuery("");
    setResults([]);
  };

  const showResults = query.trim().length >= 2;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-white max-w-[430px] mx-auto flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => {
            onClose();
            setQuery("");
            setResults([]);
          }}
          className="p-1 shrink-0"
        >
          <svg
            className="w-5 h-5 text-[#111]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h2 className="text-[18px] font-semibold text-[#111]">
          Select Location
        </h2>
      </div>

      {/* Search input */}
      <div className="px-4 pb-3 shrink-0 relative z-[500]">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#999]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for area, street name..."
            className="w-full pl-10 pr-4 py-3 border border-[#e5e5e5] rounded-[12px] text-[16px] text-[#111] placeholder:text-[#999] focus:outline-none focus:ring-2 focus:ring-[#02583f] focus:border-transparent bg-white"
          />
        </div>

        {/* Search results dropdown */}
        {showResults && (
          <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-[12px] shadow-lg border border-[#e5e5e5] max-h-[250px] overflow-y-auto z-[30]">
            {searching && (
              <p className="text-[#999] text-[13px] py-4 text-center">
                Searching...
              </p>
            )}
            {!searching && results.length === 0 && (
              <p className="text-[#999] text-[13px] py-4 text-center">
                No results found
              </p>
            )}
            {results.map((result, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectResult(result)}
                className="w-full flex items-start gap-3 py-3 px-4 border-b border-[#f0f0f0] last:border-0 text-left hover:bg-[#fafafa] transition-colors"
              >
                <svg
                  className="w-4 h-4 text-[#999] shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-[#111] text-[13px] font-medium leading-[18px]">
                    {result.address.split(",")[0]}
                  </p>
                  <p className="text-[#999] text-[11px] leading-[16px] truncate">
                    {result.address}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative z-[1]">
        <MapView center={pinPosition} onPinMove={handlePinMove} />

        {/* Current location button on map */}
        <button
          type="button"
          onClick={handleGPS}
          disabled={gpsLoading}
          className="absolute bottom-6 right-14 z-[10] bg-white rounded-full shadow-lg flex items-center gap-2 px-4 py-2.5 disabled:opacity-60"
        >
          {gpsLoading ? (
            <div className="w-4 h-4 border-2 border-[#02583f] border-t-transparent rounded-full animate-spin shrink-0" />
          ) : (
            <svg
              className="w-4 h-4 text-[#02583f] shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0013 3.06V1h-2v2.06A8.994 8.994 0 003.06 11H1v2h2.06A8.994 8.994 0 0011 20.94V23h2v-2.06A8.994 8.994 0 0020.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          )}
          <span className="text-[#02583f] text-[13px] font-medium">
            {gpsLoading ? "Locating..." : "Current Location"}
          </span>
        </button>

        {/* GPS error toast */}
        {gpsError && (
          <div className="absolute bottom-20 left-4 right-4 z-[10] bg-red-500 text-white text-[13px] text-center py-2.5 px-4 rounded-xl shadow-lg">
            {gpsError}
          </div>
        )}
      </div>

      {/* Bottom card with address + confirm */}
      <div className="shrink-0 bg-white border-t border-[#e6e6e6] px-4 py-4">
        <div className="flex items-start gap-3 mb-3">
          <svg
            className="w-5 h-5 text-[#f56215] shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <div className="flex-1 min-w-0">
            {reversing ? (
              <p className="text-[#999] text-[13px]">Getting address...</p>
            ) : pinAddress ? (
              <>
                <p className="text-[#111] text-[14px] font-semibold leading-[20px]">
                  {pinAddress.split(",")[0]}
                </p>
                <p className="text-[#999] text-[12px] leading-[18px] line-clamp-2">
                  {pinAddress}
                </p>
              </>
            ) : (
              <p className="text-[#999] text-[13px]">
                Move the pin to select location
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          {/* <button
            type="button"
            onClick={handleConfirm}
            disabled={!pinAddress && !reversing}
            className="flex-1 py-3 rounded-[12px] bg-[#02583f] text-white font-semibold text-[15px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#024731] transition-colors"
          >
            Confirm Location
          </button> */}
          <button
            type="button"
            onClick={() => setAddressSheetOpen(true)}
            disabled={!pinAddress && !reversing}
            className="w-full py-3 rounded-[12px] border border-[#02583f] text-[#02583f] font-semibold text-[14px] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[rgba(2,88,63,0.06)] transition-colors"
          >
            Add More Address Details
          </button>
        </div>
      </div>

      {/* Address details sheet */}
      <AddAddressSheet
        open={addressSheetOpen}
        onClose={() => setAddressSheetOpen(false)}
        onSaved={handleAddressSaved}
        editAddress={
          pinAddress
            ? {
                id: editAddressProp?.id,
                address: pinAddress,
                lat: pinPosition[0],
                long: pinPosition[1],
                pincode: pinPincode ?? editAddressProp?.pincode ?? "",
                receiverName: editAddressProp?.receiverName,
                receiverPhone: editAddressProp?.receiverPhone,
              }
            : null
        }
      />
    </div>
  );
}
