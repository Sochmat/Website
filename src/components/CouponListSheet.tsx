"use client";

import { useEffect } from "react";
import { couponLabel, type StoreCoupon } from "@/lib/couponDisplay";

interface CouponListSheetProps {
  open: boolean;
  onClose: () => void;
  /** Coupons on offer at the customer's location. */
  coupons: StoreCoupon[];
  /** Cart subtotal — decides which offers are unlocked. */
  totalPrice: number;
  /** Code currently being applied, so its row can show a busy state. */
  applyingCode?: string;
  onApply: (code: string) => void;
}

/**
 * The "View all coupons" sheet: every coupon running at this location, tap one
 * to apply. Offers below the cart's minimum stay visible but disabled, with
 * how much more is needed — that's the nudge to add another item.
 */
export default function CouponListSheet({
  open,
  onClose,
  coupons,
  totalPrice,
  applyingCode = "",
  onApply,
}: CouponListSheetProps) {
  // Lock background scroll and wire Escape-to-close while open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[230] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-[231] mx-auto flex max-h-[85dvh] max-w-[430px] animate-slide-up flex-col rounded-t-[28px] bg-[#faf7f2] shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
        role="dialog"
        aria-modal="true"
        aria-label="Available coupons"
      >
        <div className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-[#e0d9cf]" />

        <div className="flex shrink-0 items-center justify-between px-5 pt-3 pb-2">
          <div>
            <h2 className="text-base font-bold text-[#111]">
              Available coupons
            </h2>
            <p className="text-xs text-[#8a8a8a]">
              Tap a coupon to apply it to this order
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#111] shadow-sm"
          >
            <svg
              className="h-4 w-4"
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
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 pt-2 pb-6">
          {coupons.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#8a8a8a]">
              No coupons available right now.
            </p>
          ) : (
            coupons.map((coupon) => {
              const meetsMin =
                !coupon.minAmount || totalPrice >= coupon.minAmount;
              const shortBy = (coupon.minAmount ?? 0) - totalPrice;
              const busy = applyingCode === coupon.code;
              return (
                <div
                  key={coupon.code}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[#e0d9cf] bg-white p-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold tracking-wide text-[#111]">
                      {coupon.code}
                    </p>
                    <p
                      className={`mt-0.5 text-xs font-medium ${
                        meetsMin ? "text-[#00a86e]" : "text-gray-400"
                      }`}
                    >
                      {couponLabel(coupon)}
                    </p>
                    {!meetsMin && (
                      <p className="mt-1 text-[11px] text-gray-400">
                        Add ₹{shortBy} more to unlock
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onApply(coupon.code)}
                    disabled={!meetsMin || Boolean(applyingCode)}
                    className="h-9 shrink-0 rounded-lg border border-[#f56215] bg-[rgba(245,98,21,0.06)] px-4 text-sm font-semibold text-[#f56215] disabled:cursor-not-allowed disabled:border-[#e5e5e5] disabled:bg-transparent disabled:text-gray-400"
                  >
                    {busy ? "Applying..." : "Apply"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
