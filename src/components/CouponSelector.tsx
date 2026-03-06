"use client";

import { useEffect, useMemo, useState } from "react";
import { Select, message } from "antd";

type Coupon = {
  code: string;
  discountType: "flat" | "percent";
  discountAmount: number;
  discountPercent: number;
  maxDiscount: number;
  minAmount?: number;
};

export type AppliedCoupon = {
  code: string;
  discountAmount: number;
};

interface CouponSelectorProps {
  totalPrice: number;
  onCouponChange: (coupon: AppliedCoupon | null) => void;
}

function computeDiscount(coupon: Coupon, totalPrice: number): number {
  if (coupon.discountType === "percent") {
    const raw = Math.round((totalPrice * coupon.discountPercent) / 100);
    return coupon.maxDiscount > 0 ? Math.min(raw, coupon.maxDiscount) : raw;
  }
  return coupon.discountAmount;
}

export default function CouponSelector({
  totalPrice,
  onCouponChange,
}: CouponSelectorProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCouponCode, setSelectedCouponCode] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/coupons")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.coupons)) {
          setCoupons(data.coupons);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCoupon = useMemo(
    () => coupons.find((coupon) => coupon.code === selectedCouponCode) ?? null,
    [coupons, selectedCouponCode],
  );

  const appliedCoupon = useMemo(
    () => coupons.find((coupon) => coupon.code === appliedCouponCode) ?? null,
    [coupons, appliedCouponCode],
  );

  useEffect(() => {
    if (appliedCoupon?.minAmount && totalPrice < appliedCoupon.minAmount) {
      setAppliedCouponCode(null);
      onCouponChange(null);
    }
  }, [totalPrice, appliedCoupon, onCouponChange]);

  const handleApplyOrRemove = () => {
    if (appliedCouponCode) {
      setAppliedCouponCode(null);
      onCouponChange(null);
      return;
    }

    if (!selectedCoupon) {
      message.info("Please select a coupon");
      return;
    }

    setAppliedCouponCode(selectedCoupon.code);
    onCouponChange({
      code: selectedCoupon.code,
      discountAmount: computeDiscount(selectedCoupon, totalPrice),
    });
  };

  return (
    <div className="bg-white rounded-xl p-3 space-y-3">
      {coupons.length === 0 ? (
        <p className="text-sm text-gray-500">No coupons available</p>
      ) : (
        <>
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

          <div className="flex items-center gap-2">
            <Select
              value={selectedCouponCode || undefined}
              onChange={(value) => setSelectedCouponCode(value)}
              placeholder="Select a coupon"
              disabled={Boolean(appliedCouponCode)}
              className="flex-1"
              popupMatchSelectWidth={false}
              optionFilterProp="label"
              options={coupons.map((coupon) => {
                const meetsMin = !coupon.minAmount || totalPrice >= coupon.minAmount;
                const label =
                  coupon.discountType === "percent"
                    ? `${coupon.code} - ${coupon.discountPercent}% off upto Rs ${coupon.maxDiscount}`
                    : `${coupon.code} - Save Rs ${coupon.discountAmount}`;
                return { value: coupon.code, label, title: coupon.code, disabled: !meetsMin };
              })}
              optionRender={(option) => {
                const coupon = coupons.find(
                  (item) => item.code === option.value,
                );
                if (!coupon) return option.label;
                const meetsMin = !coupon.minAmount || totalPrice >= coupon.minAmount;
                const desc =
                  coupon.discountType === "percent"
                    ? `${coupon.discountPercent}% off upto Rs ${coupon.maxDiscount}`
                    : `Save Rs ${coupon.discountAmount}`;
                return (
                  <div>
                    <div className="flex items-center justify-between gap-6">
                      <span className={`font-medium ${meetsMin ? "text-[#111]" : "text-gray-400"}`}>
                        {coupon.code}
                      </span>
                      <span className={`text-xs font-medium ${meetsMin ? "text-[#00a86e]" : "text-gray-400"}`}>
                        {desc}
                      </span>
                    </div>
                    {!meetsMin && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Min order: Rs {coupon.minAmount}
                      </p>
                    )}
                  </div>
                );
              }}
            />

            <button
              type="button"
              onClick={handleApplyOrRemove}
              className="h-8 px-4 rounded-md border border-[#f56215] text-[#f56215] text-sm font-medium bg-[rgba(245,98,21,0.06)]"
            >
              {appliedCouponCode ? "Remove" : "Apply"}
            </button>
          </div>

          {appliedCoupon && (
            <p className="text-sm text-[#00a86e]">
              Coupon &quot;{appliedCoupon.code}&quot; applied. You save Rs{" "}
              {computeDiscount(appliedCoupon, totalPrice)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
