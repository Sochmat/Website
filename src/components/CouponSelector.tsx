"use client";

import { useCallback, useEffect, useState } from "react";
import { Input, message } from "antd";

type FreeItem = { id: string; name: string; price: number };

type Coupon = {
  code: string;
  discountType: "flat" | "percent" | "freeItem";
  discountAmount: number;
  discountPercent: number;
  maxDiscount: number;
  minAmount?: number;
  freeItem?: FreeItem | null;
};

export type AppliedCoupon = {
  code: string;
  discountAmount: number;
  /** Item granted free, present only for free-item coupons. */
  freeItem?: FreeItem;
};

interface CouponSelectorProps {
  totalPrice: number;
  onCouponChange: (coupon: AppliedCoupon | null) => void;
}

function percentDiscount(total: number, pct: number, max: number): number {
  const raw = Math.round((total * pct) / 100);
  return max > 0 ? Math.min(raw, max) : raw;
}

function computeDiscount(coupon: Coupon, totalPrice: number): number {
  if (coupon.discountType === "percent")
    return percentDiscount(
      totalPrice,
      coupon.discountPercent,
      coupon.maxDiscount,
    );
  // Free-item coupons grant an extra item, plus an optional flat/percent
  // discount on the bill.
  if (coupon.discountType === "freeItem") {
    if (coupon.discountPercent > 0)
      return percentDiscount(
        totalPrice,
        coupon.discountPercent,
        coupon.maxDiscount,
      );
    return coupon.discountAmount || 0;
  }
  return coupon.discountAmount;
}

export default function CouponSelector({
  totalPrice,
  onCouponChange,
}: CouponSelectorProps) {
  const [codeInput, setCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

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

  // Keep the discount in sync with the cart total for percent-based coupons.
  useEffect(() => {
    if (!appliedCoupon) return;
    onCouponChange({
      code: appliedCoupon.code,
      discountAmount: computeDiscount(appliedCoupon, totalPrice),
      freeItem:
        appliedCoupon.discountType === "freeItem" && appliedCoupon.freeItem
          ? appliedCoupon.freeItem
          : undefined,
    });
  }, [appliedCoupon, totalPrice, onCouponChange]);

  const handleApply = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      setError("Please enter a coupon code");
      return;
    }

    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, totalPrice }),
      });
      const data = await res.json();

      if (!data.success || !data.coupon) {
        setError(data.message || "Invalid coupon code");
        return;
      }

      setAppliedCoupon(data.coupon as Coupon);
      setCodeInput(code);
      message.success(`Coupon "${code}" applied`);
    } catch {
      setError("Could not apply coupon. Please try again.");
    } finally {
      setApplying(false);
    }
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
            if (!appliedCoupon && !applying) handleApply();
          }}
          placeholder="Enter coupon code"
          disabled={Boolean(appliedCoupon)}
          className="flex-1"
          allowClear
        />

        <button
          type="button"
          onClick={appliedCoupon ? removeCoupon : handleApply}
          disabled={applying}
          className="h-8 px-4 rounded-md border border-[#f56215] text-[#f56215] text-sm font-medium bg-[rgba(245,98,21,0.06)] disabled:opacity-60"
        >
          {appliedCoupon ? "Remove" : applying ? "Applying..." : "Apply"}
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {appliedCoupon &&
        (appliedCoupon.discountType === "freeItem" ? (
          <p className="text-sm text-[#00a86e]">
            Coupon &quot;{appliedCoupon.code}&quot; applied. You get{" "}
            {appliedCoupon.freeItem?.name ?? "an item"} free
            {computeDiscount(appliedCoupon, totalPrice) > 0
              ? ` and save Rs ${computeDiscount(appliedCoupon, totalPrice)}`
              : ""}
            !
          </p>
        ) : (
          <p className="text-sm text-[#00a86e]">
            Coupon &quot;{appliedCoupon.code}&quot; applied. You save Rs{" "}
            {computeDiscount(appliedCoupon, totalPrice)}.
          </p>
        ))}
    </div>
  );
}
