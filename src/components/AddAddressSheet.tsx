"use client";

import { useState, useEffect } from "react";
import { BUSINESS_LAT, BUSINESS_LNG } from "@/helpers/distance";
import { useUser } from "@/context/UserContext";
import type { UserAddress } from "@/lib/types";
import { Divider } from "antd";
import { message } from "antd";

interface AddAddressSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved?: (addr: UserAddress) => void;
  editAddress?: UserAddress | null;
  /** Legacy prop — if provided, skip internal save logic */
  onSave?: (addr: UserAddress) => void;
}

export default function AddAddressSheet({
  open,
  onClose,
  onSaved,
  editAddress,
  onSave,
}: AddAddressSheetProps) {
  const { user, isAuthenticated, setUser } = useUser();

  const parseAddress = (address: string) => {
    const parts = address.split(",").map((p) => p.trim());
    if (parts.length >= 2) {
      return { flat: parts[0], locality: parts.slice(1).join(", ") };
    }
    return { flat: "", locality: address };
  };

  const [flat, setFlat] = useState(() =>
    editAddress ? parseAddress(editAddress.address).flat : "",
  );
  const [locality, setLocality] = useState(() =>
    editAddress ? parseAddress(editAddress.address).locality : "",
  );
  const [receiverName, setReceiverName] = useState(
    () => editAddress?.receiverName ?? "",
  );
  const [receiverPhone, setReceiverPhone] = useState(
    () => editAddress?.receiverPhone ?? "",
  );
  const [pickupAtStore, setPickupAtStore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationData, setLocationData] = useState<{
    lat: number;
    lng: number;
    address?: string;
    pincode?: string;
  } | null>(() =>
    editAddress
      ? {
          lat: editAddress.lat,
          lng: editAddress.long,
          pincode: editAddress.pincode,
        }
      : null,
  );

  useEffect(() => {
    if (open && editAddress) {
      const parsed = parseAddress(editAddress.address);
      setFlat(parsed.flat);
      setLocality(parsed.locality);
      setReceiverName(editAddress.receiverName ?? "");
      setReceiverPhone(editAddress.receiverPhone ?? "");
      setLocationData({
        lat: editAddress.lat,
        lng: editAddress.long,
        pincode: editAddress.pincode,
      });
    } else if (open && !editAddress) {
      setFlat("");
      setLocality("");
      setReceiverName("");
      setReceiverPhone("");
      setLocationData(null);
    }
  }, [open, editAddress]);

  const handleUseStoreLocation = () => {
    setLocationData({
      lat: BUSINESS_LAT,
      lng: BUSINESS_LNG,
      address: "Store Location",
      pincode: "122001",
    });
    setLocality("Store Location, Gurgaon");
    setPickupAtStore(true);
  };

  const handleSave = async () => {
    const addressStr = [flat, locality].filter(Boolean).join(", ");
    if (!addressStr.trim()) return;
    if (!receiverName.trim()) return;
    if (!receiverPhone.trim()) return;
    const lat = locationData?.lat ?? 0;
    const long = locationData?.lng ?? 0;
    const pincode = locationData?.pincode ?? "";
    setSaving(true);

    const newAddr: UserAddress = {
      id:
        editAddress?.id ??
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : undefined),
      address: addressStr.trim(),
      lat,
      long,
      pincode: pincode.trim() || "—",
      receiverName: receiverName.trim(),
      receiverPhone: receiverPhone.trim(),
    };

    try {
      // If legacy onSave prop is provided, use that instead
      if (onSave) {
        onSave(newAddr);
        if (!editAddress) {
          setFlat("");
          setLocality("");
          setReceiverName("");
          setReceiverPhone("");
          setLocationData(null);
        }
        onClose();
        return;
      }

      const isEditing = editAddress?.id != null;

      if (isAuthenticated && user?._id) {
        let updatedAddresses: UserAddress[];
        if (isEditing) {
          updatedAddresses = (user.addresses ?? []).map((addr) =>
            addr.id === editAddress!.id ? newAddr : addr,
          );
        } else {
          updatedAddresses = [...(user.addresses ?? []), newAddr];
        }
        const res = await fetch("/api/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            _id: user._id,
            addresses: updatedAddresses,
          }),
        });
        const data = await res.json();
        if (data.success && data.user) {
          setUser(data.user);
          message.success(isEditing ? "Address updated" : "Address saved");
        } else {
          message.error(data.message ?? "Failed to save address");
          return;
        }
      } else {
        // Save to localStorage
        const stored = typeof window !== "undefined"
          ? localStorage.getItem("order_addresses")
          : null;
        let addresses: UserAddress[] = [];
        try {
          if (stored) addresses = JSON.parse(stored);
        } catch { /* ignore */ }

        if (isEditing) {
          addresses = addresses.map((addr) =>
            addr.id === editAddress!.id ? newAddr : addr,
          );
        } else {
          addresses.push(newAddr);
        }
        if (typeof window !== "undefined") {
          localStorage.setItem("order_addresses", JSON.stringify(addresses));
        }
        message.success(isEditing ? "Address updated" : "Address saved");
      }

      if (!editAddress) {
        setFlat("");
        setLocality("");
        setReceiverName("");
        setReceiverPhone("");
        setLocationData(null);
      }
      onSaved?.(newAddr);
      onClose();
    } catch {
      message.error("Failed to save address");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const addressStr = [flat, locality].filter(Boolean).join(", ");
  const phoneDigits = receiverPhone.replace(/\D/g, "");
  const validPhone = phoneDigits.length === 10;
  const canSave =
    addressStr.trim().length > 0 &&
    receiverName.trim().length > 0 &&
    validPhone;

  return (
    <>
      <div
        className="fixed inset-0 z-[220] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-[221] max-w-[430px] mx-auto bg-white rounded-t-[24px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Add New Address"
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-4 pb-8 pt-2">
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={onClose}
              className="p-2 -ml-2 text-[#111]"
              aria-label="Back"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h2 className="text-lg font-semibold text-[#111]">
              {editAddress?.id ? "Edit Address" : "Add New Address"}
            </h2>
          </div>

          {!pickupAtStore && (
            <input
              type="text"
              placeholder="E.g. Floor, Flat no., Tower"
              value={flat}
              onChange={(e) => setFlat(e.target.value)}
              className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent mb-3"
            />
          )}
          <input
            type="text"
            placeholder="E.g. Office Building, Locality Name"
            value={locality}
            onChange={(e) => setLocality(e.target.value)}
            className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent mb-2"
          />

          <Divider style={{ margin: "8px 0px" }} />

          <input
            type="text"
            placeholder="Receiver's Name *"
            value={receiverName}
            onChange={(e) => setReceiverName(e.target.value)}
            required
            className="w-full border border-[#e5e5e5] rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent mb-3"
          />
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="Enter 10-digit Phone Number *"
            value={receiverPhone}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 10);
              setReceiverPhone(val);
            }}
            required
            className={`w-full border rounded-xl px-4 py-3 text-[#111] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[#f56215] focus:border-transparent ${receiverPhone.length > 0 && !validPhone ? "border-red-400 mb-1" : "border-[#e5e5e5] mb-6"}`}
          />
          {receiverPhone.length > 0 && !validPhone && (
            <p className="text-red-500 text-xs mb-4">
              Phone number must be exactly 10 digits
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="w-full py-3.5 rounded-xl bg-[#f56215] text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving
              ? "Saving…"
              : editAddress?.id
                ? "Update Address"
                : "Save Address"}
          </button>
        </div>
      </div>
    </>
  );
}
