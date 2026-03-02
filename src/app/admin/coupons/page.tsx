"use client";

import { useState, useEffect } from "react";
import { Coupon } from "@/lib/types";

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"flat" | "percent">("flat");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      const res = await fetch("/api/admin/coupons");
      const data = await res.json();
      if (data.success) setCoupons(data.coupons ?? []);
    } catch (err) {
      console.error("Failed to fetch coupons:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          discountType,
          discountAmount: discountType === "flat" ? Number(discountAmount) || 0 : 0,
          discountPercent: discountType === "percent" ? Number(discountPercent) || 0 : 0,
          maxDiscount: discountType === "percent" ? Number(maxDiscount) || 0 : 0,
          active: true,
        }),
      });
      setCode("");
      setDiscountType("flat");
      setDiscountAmount("");
      setDiscountPercent("");
      setMaxDiscount("");
      fetchCoupons();
    } catch (err) {
      console.error("Failed to create coupon:", err);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this coupon?")) return;
    try {
      await fetch(`/api/admin/coupons?id=${id}`, { method: "DELETE" });
      fetchCoupons();
    } catch (err) {
      console.error("Failed to delete coupon:", err);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Add Coupon</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g., GET150"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Discount Type
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiscountType("flat")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  discountType === "flat"
                    ? "bg-[#02583f] text-white border-[#02583f]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                Flat (₹)
              </button>
              <button
                type="button"
                onClick={() => setDiscountType("percent")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  discountType === "percent"
                    ? "bg-[#02583f] text-white border-[#02583f]"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                Percentage (%)
              </button>
            </div>
          </div>

          {discountType === "flat" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount (₹)
              </label>
              <input
                type="number"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                placeholder="e.g., 150"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                required
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount (%)
                </label>
                <input
                  type="number"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="e.g., 20"
                  min={1}
                  max={100}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Discount (₹)
                </label>
                <input
                  type="number"
                  value={maxDiscount}
                  onChange={(e) => setMaxDiscount(e.target.value)}
                  placeholder="e.g., 100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  required
                />
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#02583f] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
          >
            {loading ? "Adding..." : "Add Coupon"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">
          Coupons ({coupons.length})
        </h2>
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {coupons.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No coupons yet.</p>
          ) : (
            coupons.map((coupon) => (
              <div
                key={coupon._id?.toString() ?? coupon.code}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-800">{coupon.code}</p>
                  <p className="text-sm text-gray-500">
                    {coupon.discountType === "percent"
                      ? `${coupon.discountPercent}% off upto ₹${coupon.maxDiscount}`
                      : `₹${coupon.discountAmount} off`}
                  </p>
                  <span
                    className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${
                      coupon.active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {coupon.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleDelete(coupon._id != null ? String(coupon._id) : "")
                  }
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
