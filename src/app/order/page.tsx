"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { useLocation } from "@/context/LocationContext";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import CartItem from "@/components/CartItem";
import RecommendedItem from "@/components/RecommendedItem";
import SelectAddressSheet from "@/components/SelectAddressSheet";
// AddAddressSheet is now used internally by LocationSelector
import CouponSelector, {
  type AppliedCoupon,
} from "@/components/CouponSelector";
import { useRouter } from "next/navigation";
import {
  distanceFromBusinessKm,
  isWithinServiceArea,
} from "@/helpers/distance";
import { Order, type UserAddress } from "@/lib/types";
import { message } from "antd";
import type { Product } from "@/context/CartContext";
import { handleRazorpayPayment, type UpiApp } from "@/helpers/razorpay";
import { ArrowRightIcon } from "lucide-react";
import LocationSelector from "@/components/LocationSelector";

export default function OrderPage() {
  const {
    items,
    totalItems,
    totalKcal,
    totalProtein,
    totalPrice,
    totalOriginalPrice,
    totalDiscount,
    clearCart,
  } = useCart();
  const { distanceFromStoreKm, isServiceable } = useLocation();
  const { user, isAuthenticated, isLoading: userLoading } = useUser();
  const { openLoginPopup } = useLoginPopup();

  useEffect(() => {
    if (!userLoading && !isAuthenticated) {
      openLoginPopup();
    }
  }, [userLoading, isAuthenticated, openLoginPopup]);
  const [selectedAddress, setSelectedAddress] = useState<UserAddress | null>(
    null,
  );
  const [localAddresses, setLocalAddresses] = useState<UserAddress[]>([]);
  const [showSelectAddress, setShowSelectAddress] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(
    null,
  );
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const paymentMethod = "razorpay" as const;
  const selectedUpiApp: UpiApp | null = null;
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/menu")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.items)) {
          const recommended = (
            data.items as (Product & { isRecommended?: boolean })[]
          )
            .filter((item) => item.isRecommended === true)
            .map((item) => ({
              id: item.id,
              name: item.name,
              kcal: item.kcal,
              protein: item.protein,
              price: item.price,
              originalPrice: item.originalPrice,
              discount: item.discount ?? "",
              rating: item.rating ?? 0,
              reviews: item.reviews ?? "",
              badge: item.badge ?? null,
              image: item.image,
              isVeg: item.isVeg,
            }));
          setRecommendedProducts(recommended);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const addresses = isAuthenticated ? (user?.addresses ?? []) : localAddresses;

  useEffect(() => {
    if (!isAuthenticated && typeof window !== "undefined") {
      const stored = localStorage.getItem("order_addresses");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as UserAddress[];
          setLocalAddresses(parsed);
          if (parsed.length > 0 && !selectedAddress) {
            setSelectedAddress(parsed[0]);
          }
        } catch {
          // ignore
        }
      }
    }
  }, [isAuthenticated, selectedAddress]);

  useEffect(() => {
    if (
      isAuthenticated &&
      user?.addresses &&
      user.addresses.length > 0 &&
      !selectedAddress
    ) {
      setSelectedAddress(user.addresses[0]);
    } else if (
      !isAuthenticated &&
      localAddresses.length > 0 &&
      !selectedAddress
    ) {
      setSelectedAddress(localAddresses[0]);
    }
  }, [isAuthenticated, user?.addresses, localAddresses, selectedAddress]);

  const selectedAddressServiceable = selectedAddress
    ? isWithinServiceArea(selectedAddress.lat, selectedAddress.long)
    : null;
  const selectedAddressDistance = selectedAddress
    ? distanceFromBusinessKm(selectedAddress.lat, selectedAddress.long)
    : null;

  const requireLogin = () => {
    if (!isAuthenticated) {
      openLoginPopup();
      return false;
    }
    return true;
  };

  const handleEditAddress = (addr: UserAddress) => {
    setEditingAddress(addr);
    setShowSelectAddress(false);
    setShowLocationSelector(true);
  };

  const handlePlaceOrder = async () => {
    if (!isAuthenticated) {
      openLoginPopup();
      return;
    }
    if (!selectedAddress) {
      message.error("Please select a delivery address");
      setShowSelectAddress(true);
      return;
    }
    if (!selectedAddress.receiverName || !selectedAddress.receiverPhone) {
      message.error("Please enter receiver name and phone number");
      setShowAddAddress(true);
      return;
    }
    if (selectedAddressServiceable === false) {
      message.error(
        `Delivery not available at this address. You're ${selectedAddressDistance?.toFixed(1)} km away; we deliver within 10 km only.`,
      );
      return;
    }
    setPlacingOrder(true);
    try {
      const couponDiscountAmount = appliedCoupon?.discountAmount ?? 0;
      const gstAmount = Math.round(totalPrice * 0.05);
      const finalAmount = totalPrice - couponDiscountAmount + gstAmount;

      const receiverName = selectedAddress.receiverName ?? "";
      const receiverPhone = selectedAddress.receiverPhone ?? "";

      const orderPayload: Order = {
        paymentStatus: paymentMethod === "razorpay" ? "pending" : "pending",
        status: "pending",
        userId: isAuthenticated && user?._id ? String(user._id) : undefined,
        receiver: {
          name: isAuthenticated && user?.name ? user.name : receiverName,
          phone: isAuthenticated && user?.phone ? user.phone : receiverPhone,
          address: selectedAddress.address,
          lat: selectedAddress.lat,
          lng: selectedAddress.long,
        },
        orderItems: items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
        })),
        totalAmount: finalAmount,
        discountAmount: couponDiscountAmount,
        tax: gstAmount,
        paymentMethod: paymentMethod,
        couponCode: appliedCoupon?.code ?? undefined,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.message ?? "Failed to place order");
        return;
      }

      if (paymentMethod === "razorpay") {
        await handleRazorpayPayment({
          amount: finalAmount,
          currency: "INR",
          name: "Sochmat",
          description: `Order #${data.order?.orderNumber || ""}`,
          prefill: {
            name:
              (isAuthenticated ? user?.name : null) ??
              selectedAddress.receiverName ??
              "",
            email: user?.email ?? "vectorharsh@gmail.com",
            contact:
              (isAuthenticated ? user?.phone : null) ??
              selectedAddress.receiverPhone ??
              "",
          },
          orderId: data.order?._id,
          upiApp: selectedUpiApp ?? undefined,
          onSuccess: () => {
            clearCart();
            router.push(
              `/success${data.order?._id ? `?orderId=${data.order._id}` : ""}`,
            );
          },
          onError: (error) => {
            message.error(error.message || "Payment failed");
            console.error(error);
            setPlacingOrder(false);
          },
        });
      } else {
        clearCart();
        router.push(
          `/success${data.order?._id ? `?orderId=${data.order._id}` : ""}`,
        );
      }
    } catch (error: any) {
      message.error(error.message || "Failed to place order");
      console.error(error);
    } finally {
      if (paymentMethod !== "razorpay") {
        setPlacingOrder(false);
      }
    }
  };

  const couponDiscount = appliedCoupon?.discountAmount ?? 0;
  const gst = Math.round(totalPrice * 0.05);
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
        <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <svg
                className="w-5 h-5 text-[#111] shrink-0 mt-0.5"
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
              <div>
                <p className="font-semibold text-[#111] text-[15px]">
                  Delivery at
                </p>
                {!selectedAddress ? (
                  <p className="text-sm text-[#737373] mt-1">
                    Add delivery address
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-[#111] mt-1">
                      {selectedAddress.address}
                    </p>
                    <p className="text-sm font-semibold text-[#111] mt-0.5">
                      {selectedAddress.pincode}
                    </p>
                    {selectedAddress.receiverName && (
                      <p className="text-xs text-[#737373] mt-0.5">
                        Deliver to: {selectedAddress.receiverName}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!requireLogin()) return;
                setShowSelectAddress(true);
              }}
              className="text-[#f56215] font-semibold text-sm underline shrink-0"
            >
              {selectedAddress ? "Change" : "Add"}
            </button>
          </div>
        </div>

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

        {recommendedProducts.length > 0 && (
          <div className="bg-white rounded-xl p-3">
            <p className="font-medium text-[13px] text-black mb-2.5">
              Recommended Items
            </p>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {recommendedProducts.map((product) => (
                <RecommendedItem key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        <CouponSelector
          totalPrice={totalPrice}
          onCouponChange={setAppliedCoupon}
        />

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
                ₹{Number(totalOriginalPrice - finalPrice).toFixed(2)} saved!
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
                    <span className="text-[#00a86e]">
                      ₹{Math.round(totalPrice)}
                    </span>
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

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] flex flex-col z-50">
        <div className="bg-[#E1EBE8] rounded-t-2xl pt-2 pb-5 text-center">
          <span className="text-[#1c1c1c] font-semibold text-sm">
            {totalKcal} kcal | {totalProtein}g Protein
          </span>
        </div>
        <div className="bg-white px-6 py-5 flex items-center justify-between rounded-t-2xl -mt-3">
          <div className="flex flex-col">
            <span className="text-[#222] text-sm">Payment</span>
            <span className="text-[#f56215] text-sm font-semibold">Online</span>
          </div>
          <button
            type="button"
            className="bg-[#f56215] flex items-center gap-3 px-5 py-2.5 rounded-xl cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            onClick={() => {
              if (!requireLogin()) return;
              if (!selectedAddress) {
                message.error("Please select a delivery address first");
                setShowSelectAddress(true);
                return;
              }
              handlePlaceOrder();
            }}
            disabled={placingOrder}
          >
            <div className="flex flex-col items-start text-white">
              <span className="font-semibold">
                {placingOrder ? "Placing…" : "Place Order"}
              </span>
              <span className="font-medium text-sm">₹{finalPrice}</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      <SelectAddressSheet
        open={showSelectAddress && !showAddAddress}
        onClose={() => {
          setShowSelectAddress(false);
          setEditingAddress(null);
        }}
        addresses={addresses}
        selectedAddress={selectedAddress}
        onSelect={(addr) => {
          setSelectedAddress(addr);
          setShowSelectAddress(false);
          if (!isWithinServiceArea(addr.lat, addr.long)) {
            const dist = distanceFromBusinessKm(addr.lat, addr.long);
            message.error(
              `Delivery not available at this address. You're ${dist.toFixed(1)} km away; we deliver within 10 km only.`,
            );
          }
        }}
        onAddNew={() => {
          setEditingAddress(null);
          setShowSelectAddress(false);
          setShowLocationSelector(true);
        }}
        onEdit={handleEditAddress}
      />
      <LocationSelector
        open={showLocationSelector}
        onClose={() => {
          setShowLocationSelector(false);
          setEditingAddress(null);
        }}
        editAddress={editingAddress}
        onSaved={(addr) => {
          setSelectedAddress(addr);
          setEditingAddress(null);
          if (!isWithinServiceArea(addr.lat, addr.long)) {
            const dist = distanceFromBusinessKm(addr.lat, addr.long);
            message.error(
              `Delivery not available at this address. You're ${dist.toFixed(1)} km away; we deliver within 10 km only.`,
            );
          }
          // Refresh local addresses from localStorage for non-authenticated users
          if (!isAuthenticated && typeof window !== "undefined") {
            try {
              const stored = localStorage.getItem("order_addresses");
              if (stored) setLocalAddresses(JSON.parse(stored));
            } catch {
              /* ignore */
            }
          }
        }}
      />
    </main>
  );
}
