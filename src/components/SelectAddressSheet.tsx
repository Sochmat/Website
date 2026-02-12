"use client";

import { useRef, useEffect } from "react";
import type { UserAddress } from "@/lib/types";

function sameAddress(a: UserAddress, b: UserAddress): boolean {
  if (a.id && b.id) return a.id === b.id;
  return a.address === b.address && a.pincode === b.pincode;
}

interface SelectAddressSheetProps {
  open: boolean;
  onClose: () => void;
  addresses: UserAddress[];
  selectedAddress: UserAddress | null;
  onSelect: (addr: UserAddress) => void;
  onAddNew: () => void;
  onEdit?: (addr: UserAddress) => void;
}

export default function SelectAddressSheet({
  open,
  onClose,
  addresses,
  selectedAddress,
  onSelect,
  onAddNew,
  onEdit,
}: SelectAddressSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handle);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[210] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={sheetRef}
        className="fixed left-0 right-0 bottom-0 z-[211] max-w-[430px] mx-auto bg-white rounded-t-[24px] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up max-h-[85vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Select Address"
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 shrink-0" />
        <div className="px-4 pb-6 pt-2 flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
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
            <h2 className="text-lg font-semibold text-[#111]">Select Address</h2>
          </div>

          <button
            type="button"
            onClick={onAddNew}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-[#f56215] text-[#f56215] font-medium mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add New Address
          </button>

          <div className="relative flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-[#e5e5e5]" />
            <span className="text-sm text-[#a3a3a3]">Saved Address</span>
            <div className="flex-1 h-px bg-[#e5e5e5]" />
          </div>

          <div className="overflow-y-auto space-y-3 pr-1">
            {addresses.length === 0 ? (
              <p className="text-sm text-[#737373] py-4 text-center">No saved addresses. Add one above.</p>
            ) : (
              addresses.map((addr) => {
                const showSelected = selectedAddress !== null && sameAddress(addr, selectedAddress);
                return (
                  <div
                    key={addr.id ?? `${addr.address}-${addr.pincode}`}
                    className="w-full bg-white rounded-xl border border-[#e5e5e5] p-4 relative hover:border-[#f56215]/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(addr)}
                      className="w-full text-left pr-20"
                    >
                      {showSelected && (
                        <span className="absolute top-3 right-3 bg-[#f56215] text-white text-xs font-medium px-2 py-1 rounded-md">
                          Selected
                        </span>
                      )}
                      <p className="text-sm text-[#111]">
                        Deliver to : {addr.receiverName || "—"}
                      </p>
                      <p className="text-sm text-[#111] mt-1">{addr.address}</p>
                      <p className="text-sm font-semibold text-[#111] mt-0.5">{addr.pincode}</p>
                    </button>
                    {onEdit && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(addr);
                        }}
                        className="absolute bottom-3 right-3 text-[#f56215] text-xs font-medium hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
