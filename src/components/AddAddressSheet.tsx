"use client";

import { useState } from "react";
import { getCurrentLocation } from "@/helpers/currentLocation";
import type { UserAddress } from "@/lib/types";

interface AddAddressSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (addr: UserAddress) => void;
}

export default function AddAddressSheet({ open, onClose, onSave }: AddAddressSheetProps) {
  const [flat, setFlat] = useState("");
  const [locality, setLocality] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationData, setLocationData] = useState<{ lat: number; lng: number; address?: string; pincode?: string } | null>(null);

  const handleUseCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const res = await getCurrentLocation();
      setLocationData({ lat: res.lat, lng: res.lng, address: res.address, pincode: res.pincode });
      if (res.address) setLocality(res.address);
    } catch {
      // ignore
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSave = async () => {
    const addressStr = [flat, locality].filter(Boolean).join(", ");
    if (!addressStr.trim()) return;
    const lat = locationData?.lat ?? 0;
    const long = locationData?.lng ?? 0;
    const pincode = locationData?.pincode ?? "";
    setSaving(true);
    try {
      const newAddr: UserAddress = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined,
        address: addressStr.trim(),
        lat,
        long,
        pincode: pincode.trim() || "—",
        receiverName: receiverName.trim() || undefined,
        receiverPhone: receiverPhone.trim() || undefined,
      };
      onSave(newAddr);
      setFlat("");
      setLocality("");
      setReceiverName("");
      setReceiverPhone("");
      setLocationData(null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const addressStr = [flat, locality].filter(Boolean).join(", ");
  const canSave = addressStr.trim().length > 0;

  return (
    <>
      <div className="fixed inset-0 z-[220] bg-black/40" onClick={onClose} aria-hidden />
      <div
        className="fixed left-0 right-0 bottom-0 z-[221] max-w-[430px] mx-auto bg-white rounded-t-[24px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Add New Address"
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-4 pb-8 pt-2">
          <div className="flex items-center gap-2 mb-6">
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-2 text-[#111]"
              aria-label="Back"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-[#111]">Add New Address</h2>
          </div>

          <input
            type="text"
            placeholder="E.g. Floor, Flat no., Tower"
            value={flat}
            onChange={(e) => setFlat(e.target.value)}
            className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent mb-3"
          />
          <input
            type="text"
            placeholder="E.g. Office Building, Locality Name"
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent mb-4"
          />

          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={locationLoading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[rgba(245,98,21,0.1)] text-[#f56215] font-medium mb-6 disabled:opacity-60"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {locationLoading ? "Getting location…" : "Use Current Location"}
          </button>

          <input
            type="text"
            placeholder="Receiver's Name"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent mb-3"
          />
          <input
            type="tel"
            placeholder="Enter Phone Number"
            value={receiverPhone}
            onChange={(e) => setReceiverPhone(e.target.value)}
            className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent mb-6"
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full py-3.5 rounded-xl bg-[#f56215] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save Address"}
          </button>
        </div>
      </div>
    </>
  );
}
