"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input, message } from "antd";
import CouponListSheet from "./CouponListSheet";
import {
  computeCouponDiscount,
  type FreeItem,
  type StoreCoupon,
} from "@/lib/couponDisplay";

export type AppliedCoupon = {
  code: string;
  discountAmount: number;
  /** Item granted free, present only for free-item coupons. */
  freeItem?: FreeItem;
};

interface CouponSelectorProps {
  /** Item subtotal. Minimum-order conditions are checked against this. */
  totalPrice: number;
  /**
   * What a percentage coupon is a percentage *of* — the item subtotal after the
   * location discount comes off. Defaults to `totalPrice` when there is no
   * location discount.
   */
  discountBase?: number;
  /** Selected delivery location — some codes only run at certain locations. */
  societyId: string;
  onCouponChange: (coupon: AppliedCoupon | null) => void;
}

export default function CouponSelector({
  totalPrice,
  discountBase,
  societyId,
  onCouponChange,
}: CouponSelectorProps) {
  const priceBase = discountBase ?? totalPrice;
  const [codeInput, setCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<StoreCoupon | null>(null);
  const [applying, setApplying] = useState("");
  const [error, setError] = useState("");
  // Coupons on offer at this location, to pick from instead of typing.
  const [offers, setOffers] = useState<StoreCoupon[]>([]);
  const [showOffers, setShowOffers] = useState(false);

  const removeCoupon = useCallback(() => {
    setAppliedCoupon(null);
    setCodeInput("");
    setError("");
    onCouponChange(null);
  }, [onCouponChange]);

  // The cart can change after the coupon is applied — drop it the moment the
  // order no longer meets the coupon's minimum.
  useEffect(() => {
    if (appliedCoupon?.minAmount && totalPrice < appliedCoupon.minAmount) {
      const min = appliedCoupon.minAmount;
      removeCoupon();
      setError(`Coupon removed — needs a minimum order of Rs ${min}`);
    }
  }, [totalPrice, appliedCoupon, removeCoupon]);

  // Offers are per-location, so reload them whenever the location changes.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/coupons?societyId=${encodeURIComponent(societyId)}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.success && Array.isArray(data.coupons)) {
          setOffers(data.coupons as StoreCoupon[]);
        }
      })
      .catch(() => {
        // The typed-code path still works without the list.
      });
    return () => {
      cancelled = true;
    };
  }, [societyId]);

  // A code can be scoped to certain locations, and it was validated against the
  // one selected when it was applied — drop it if the customer switches.
  const lastSocietyId = useRef(societyId);
  useEffect(() => {
    if (lastSocietyId.current === societyId) return;
    lastSocietyId.current = societyId;
    if (!appliedCoupon) return;
    removeCoupon();
    setError("Coupon removed — please re-apply it for this location");
  }, [societyId, appliedCoupon, removeCoupon]);

  // Keep the discount in sync with the cart total for percent-based coupons.
  useEffect(() => {
    if (!appliedCoupon) return;
    onCouponChange({
      code: appliedCoupon.code,
      discountAmount: computeCouponDiscount(appliedCoupon, priceBase),
      freeItem:
        appliedCoupon.discountType === "freeItem" && appliedCoupon.freeItem
          ? appliedCoupon.freeItem
          : undefined,
    });
  }, [appliedCoupon, priceBase, onCouponChange]);

  // Both entry points — the typed code and a tapped offer — apply through here,
  // so the server re-checks every condition either way.
  const applyCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) {
      setError("Please enter a coupon code");
      return;
    }

    setApplying(code);
    setError("");
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, totalPrice, societyId }),
      });
      const data = await res.json();

      if (!data.success || !data.coupon) {
        setError(data.message || "Invalid coupon code");
        return;
      }

      setAppliedCoupon(data.coupon as StoreCoupon);
      setCodeInput(code);
      message.success(`Coupon "${code}" applied`);
    } catch {
      setError("Could not apply coupon. Please try again.");
    } finally {
      setApplying("");
    }
  };

  // Picking from the sheet closes it either way — on success the applied line
  // shows below the field, on failure the error does.
  const applyFromSheet = async (code: string) => {
    await applyCode(code);
    setShowOffers(false);
  };

  return (
    <div className="bg-white rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-[#f56215] shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <p className="font-medium text-sm text-black">Apply Coupon</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={codeInput}
          onChange={(e) => {
            setCodeInput(e.target.value.toUpperCase());
            if (error) setError("");
          }}
          onPressEnter={() => {
            if (!appliedCoupon && !applying) applyCode(codeInput);
          }}
          placeholder="Enter coupon code"
          disabled={Boolean(appliedCoupon)}
          className="flex-1"
          allowClear
        />

        <button
          type="button"
          onClick={
            appliedCoupon ? removeCoupon : () => applyCode(codeInput)
          }
          disabled={Boolean(applying)}
          className="h-8 px-4 rounded-md border border-[#f56215] text-[#f56215] text-sm font-medium bg-[rgba(245,98,21,0.06)] disabled:opacity-60"
        >
          {appliedCoupon ? "Remove" : applying ? "Applying..." : "Apply"}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* The offers themselves live in a sheet, so checkout stays short.
          Hidden once a coupon is applied — only one can be used per order. */}
      {!appliedCoupon && offers.length > 0 && (
        <button
          type="button"
          onClick={() => setShowOffers(true)}
          className="flex items-center gap-1 text-sm font-medium text-[#f56215]"
        >
          View all coupons ({offers.length})
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}

      <CouponListSheet
        open={showOffers && !appliedCoupon}
        onClose={() => setShowOffers(false)}
        coupons={offers}
        totalPrice={totalPrice}
        applyingCode={applying}
        onApply={applyFromSheet}
      />

      {appliedCoupon &&
        (appliedCoupon.discountType === "freeItem" ? (
          <p className="text-sm text-[#00a86e]">
            Coupon &quot;{appliedCoupon.code}&quot; applied. You get{" "}
            {appliedCoupon.freeItem?.name ?? "an item"} free
            {computeCouponDiscount(appliedCoupon, priceBase) > 0
              ? ` and save Rs ${computeCouponDiscount(appliedCoupon, priceBase)}`
              : ""}
            !
          </p>
        ) : (
          <p className="text-sm text-[#00a86e]">
            Coupon &quot;{appliedCoupon.code}&quot; applied. You save Rs{" "}
            {computeCouponDiscount(appliedCoupon, priceBase)}.
          </p>
        ))}
    </div>
  );
}
