"use client";

import { X } from "lucide-react";

/**
 * The floating, centered close affordance used by subscription bottom sheets.
 * Render it as a sibling directly above the sheet inside a
 * `flex flex-col items-center justify-end` overlay.
 */
export default function SheetCloseButton({
  onClose,
  closing = false,
}: {
  onClose: () => void;
  closing?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={`relative z-10 mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/40 text-white backdrop-blur-sm ${
        closing ? "animate-fade-out" : ""
      }`}
    >
      <X className="h-5 w-5" />
    </button>
  );
}
