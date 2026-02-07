"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import CartItem from "@/components/CartItem";
import RecommendedItem from "@/components/RecommendedItem";

const recommendedProducts = [
  {
    id: "101",
    name: "Chocolate Protein Shake",
    kcal: 420,
    protein: 20,
    price: 160,
    originalPrice: 199,
    discount: "20% off",
    rating: 4.1,
    reviews: "500+",
    badge: null,
    image:
      "https://www.figma.com/api/mcp/asset/25b7ef51-e645-4799-a3f1-bfbe187d5cd6",
    isVeg: true,
  },
  {
    id: "102",
    name: "Chocolate Protein Shake",
    kcal: 420,
    protein: 20,
    price: 160,
    originalPrice: 199,
    discount: "20% off",
    rating: 4.1,
    reviews: "500+",
    badge: null,
    image:
      "https://www.figma.com/api/mcp/asset/25b7ef51-e645-4799-a3f1-bfbe187d5cd6",
    isVeg: true,
  },
  {
    id: "103",
    name: "Chocolate Protein Shake",
    kcal: 420,
    protein: 20,
    price: 160,
    originalPrice: 199,
    discount: "20% off",
    rating: 4.1,
    reviews: "500+",
    badge: null,
    image:
      "https://www.figma.com/api/mcp/asset/25b7ef51-e645-4799-a3f1-bfbe187d5cd6",
    isVeg: true,
  },
];

export default function OrderPage() {
  const {
    items,
    totalItems,
    totalKcal,
    totalProtein,
    totalPrice,
    totalOriginalPrice,
    totalDiscount,
  } = useCart();
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>("GET150");
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(true);

  const [formData, setFormData] = useState({
    receiverName: "",
    phoneNumber: "",
    flatDetails: "",
    locality: "",
  });

  const couponDiscount =
    appliedCoupon === "GET150" ? 150 : appliedCoupon === "GET120" ? 120 : 0;
  const gst = Math.round((totalPrice - couponDiscount) * 0.05);
  const finalPrice = totalPrice - couponDiscount + gst;

  if (totalItems === 0) {
    return (
      <main className="min-h-screen bg-[#f6f6f6] max-w-[430px] mx-auto">
        <div className="bg-white border-b border-[#d9d9d9] flex items-center gap-2 px-4 py-4">
          <Link href="/menu" className="p-1">
            <svg
              className="w-6 h-6 text-[#111]"
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
          </Link>
          <span className="text-[#111] text-lg font-semibold">Cart</span>
        </div>

        <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
          <svg
            className="w-24 h-24 text-gray-300 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            Your cart is empty
          </h2>
          <p className="text-gray-500 mb-6">
            Add some delicious items to get started!
          </p>
          <Link
            href="/menu"
            className="bg-[#f56215] text-white px-6 py-3 rounded-lg font-medium"
          >
            Browse Menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f6f6] max-w-[430px] mx-auto pb-40">
      <div className="bg-white border-b border-[#d9d9d9] flex items-center gap-2 px-4 py-4">
        <Link href="/menu" className="p-1">
          <svg
            className="w-6 h-6 text-[#111]"
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
        </Link>
        <span className="text-[#111] text-lg font-semibold">Cart</span>
      </div>

      <div className="px-4 pt-4 space-y-3">
        <div className="bg-white rounded-xl p-3 space-y-3">
          {items.map((item, index) => (
            <div key={item.id}>
              <CartItem item={item} />
              {index < items.length - 1 && (
                <div className="border-b border-gray-100 my-3" />
              )}
            </div>
          ))}

          <Link
            href="/menu"
            className="flex items-center gap-1 text-[#f56215] font-medium text-sm pt-2"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add more items
          </Link>
        </div>

        <div className="bg-white rounded-xl p-3">
          <p className="font-medium text-[13px] text-black mb-2.5">
            Recommended Add Ons
          </p>
          <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
            {recommendedProducts.map((product) => (
              <RecommendedItem key={product.id} product={product} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-3">
          <div className="flex items-start gap-2">
            <svg
              className="w-5 h-5 text-[#f56215] mt-1 shrink-0"
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
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm text-black">
                  Save ₹120 with "GET120"
                </p>
                <button className="bg-[rgba(245,98,21,0.06)] border border-[#f56215] text-[#f56215] text-sm font-medium px-3 py-1 rounded-md">
                  Apply
                </button>
              </div>
              <button className="flex items-center gap-0.5 text-[#666] text-xs mt-1">
                View all coupons
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
            </div>
          </div>
        </div>

        {appliedCoupon && (
          <div className="bg-white rounded-xl p-3">
            <div className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-[#00a86e] mt-1 shrink-0"
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
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm text-black">
                    Save ₹{couponDiscount} with "{appliedCoupon}"
                  </p>
                  <button
                    onClick={() => setAppliedCoupon(null)}
                    className="text-[#f56215] text-sm font-medium py-1"
                  >
                    Remove
                  </button>
                </div>
                <button className="flex items-center gap-0.5 text-[#666] text-xs mt-1">
                  View all coupons
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
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl p-3 space-y-4">
          <p className="font-medium text-[13px] text-black">
            Delivery Address Details
          </p>

          <input
            type="text"
            placeholder="Receiver's Name"
            value={formData.receiverName}
            onChange={(e) =>
              setFormData({ ...formData, receiverName: e.target.value })
            }
            className="w-full border border-[#e2e8f0] rounded-md px-3 py-2 text-sm placeholder-[#64748b] focus:outline-none focus:border-[#f56215]"
          />

          <input
            type="tel"
            placeholder="Enter Phone Number"
            value={formData.phoneNumber}
            onChange={(e) =>
              setFormData({ ...formData, phoneNumber: e.target.value })
            }
            className="w-full border border-[#e2e8f0] rounded-md px-3 py-2 text-sm placeholder-[#64748b] focus:outline-none focus:border-[#f56215]"
          />

          <div className="border-t border-gray-100" />

          <button className="flex items-center gap-2 bg-[rgba(245,98,21,0.06)] px-3 py-1.5 rounded-md">
            <svg
              className="w-5 h-5 text-[#f56215]"
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <span className="text-[#f56215] text-sm font-medium">
              Use Current Location
            </span>
          </button>

          <input
            type="text"
            placeholder="E.g. Floor, Flat no., Tower"
            value={formData.flatDetails}
            onChange={(e) =>
              setFormData({ ...formData, flatDetails: e.target.value })
            }
            className="w-full border border-[#e2e8f0] rounded-md px-3 py-2 text-sm placeholder-[#64748b] focus:outline-none focus:border-[#f56215]"
          />

          <input
            type="text"
            placeholder="E.g. Office Building, Locality Name"
            value={formData.locality}
            onChange={(e) =>
              setFormData({ ...formData, locality: e.target.value })
            }
            className="w-full border border-[#e2e8f0] rounded-md px-3 py-2 text-sm placeholder-[#64748b] focus:outline-none focus:border-[#f56215]"
          />
        </div>

        <div className="bg-white rounded-xl p-3">
          <button
            onClick={() => setShowPriceBreakdown(!showPriceBreakdown)}
            className="flex items-start gap-2 w-full"
          >
            <svg
              className="w-5 h-5 text-[#666] mt-0.5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span className="font-medium text-sm text-[#111]">To Pay</span>
                <span className="font-semibold text-sm text-[#111]">
                  ₹{finalPrice}
                </span>
                <span className="text-[#777] text-[13px] line-through">
                  ₹{totalOriginalPrice}
                </span>
              </div>
              <p className="text-[#00a86e] text-[11px] font-medium text-left">
                ₹{totalOriginalPrice - finalPrice} saved!
              </p>
            </div>
            <svg
              className={`w-5 h-5 text-[#666] transition-transform ${
                showPriceBreakdown ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {showPriceBreakdown && (
            <>
              <div className="border-t border-gray-100 my-3" />
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">Item Total</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[#666] line-through text-[13px]">
                      ₹{totalOriginalPrice}
                    </span>
                    <span className="text-[#00a86e]">₹{totalPrice}</span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">Discount</span>
                  <span className="text-[#00a86e]">₹{couponDiscount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">GST (5%)</span>
                  <span className="text-[#666] text-[13px]">₹{gst}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] flex flex-col">
        <div className="bg-gradient-to-r from-[rgba(2,88,63,0.12)] to-[rgba(2,88,63,0.12)] rounded-t-2xl px-4 py-2 text-center">
          <span className="text-[#02583f] font-semibold text-sm">
            {totalKcal} kcal | {totalProtein}g Protein
          </span>
        </div>
        <div className="bg-white px-6 py-5 flex items-center justify-between rounded-t-2xl -mt-3">
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[#222] text-sm">Payment Type</span>
              <svg
                className="w-5 h-5 text-[#666] -rotate-90"
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
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 bg-[#00BAF2] rounded" />
              <span className="text-[#222] font-medium">PAYTM</span>
            </div>
          </div>
          <Link
            href="/success"
            className="bg-[#f56215] flex items-center gap-3 px-5 py-2.5 rounded-xl"
          >
            <div className="flex flex-col items-start text-white">
              <span className="font-semibold">Place Order</span>
              <span className="font-medium text-sm">₹{finalPrice}</span>
            </div>
            <svg
              className="w-5 h-5 text-white -rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
