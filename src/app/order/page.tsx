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
import AddAddressSheet from "@/components/AddAddressSheet";
import { useRouter } from "next/navigation";
import { distanceFromBusinessKm, isWithinServiceArea } from "@/helpers/distance";
import { Order, type UserAddress } from "@/lib/types";
import { message } from "antd";
import type { Product } from "@/context/CartContext";
import { handleRazorpayPayment } from "@/helpers/razorpay";

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
  const { user, isAuthenticated, setUser } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const [selectedAddress, setSelectedAddress] = useState<UserAddress | null>(null);
  const [localAddresses, setLocalAddresses] = useState<UserAddress[]>([]);
  const [showSelectAddress, setShowSelectAddress] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);
  const [coupons, setCoupons] = useState<
    { code: string; discountAmount: number }[]
  >([]);
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(true);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "razorpay">("cash");
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coupons")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.success && Array.isArray(data.coupons)) {
          setCoupons(data.coupons);
          setAppliedCoupon((prev) => prev || (data.coupons[0]?.code ?? null));
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
    if (isAuthenticated && user?.addresses && user.addresses.length > 0 && !selectedAddress) {
      setSelectedAddress(user.addresses[0]);
    } else if (!isAuthenticated && localAddresses.length > 0 && !selectedAddress) {
      setSelectedAddress(localAddresses[0]);
    }
  }, [isAuthenticated, user?.addresses, localAddresses, selectedAddress]);

  const selectedAddressServiceable = selectedAddress
    ? isWithinServiceArea(selectedAddress.lat, selectedAddress.long)
    : null;
  const selectedAddressDistance = selectedAddress
    ? distanceFromBusinessKm(selectedAddress.lat, selectedAddress.long)
    : null;

  const handleSaveNewAddress = async (newAddr: UserAddress) => {
    const isEditing = editingAddress !== null;

    if (isAuthenticated && user?._id) {
      try {
        let updatedAddresses: UserAddress[];
        if (isEditing) {
          updatedAddresses = (user.addresses ?? []).map((addr) =>
            addr.id === editingAddress.id ? newAddr : addr,
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
          setSelectedAddress(newAddr);
          setShowAddAddress(false);
          setShowSelectAddress(false);
          setEditingAddress(null);
          message.success(isEditing ? "Address updated" : "Address saved");
        } else {
          message.error(data.message ?? "Failed to save address");
        }
      } catch {
        message.error("Failed to save address");
      }
    } else {
      let updatedAddresses: UserAddress[];
      if (isEditing) {
        updatedAddresses = localAddresses.map((addr) =>
          addr.id === editingAddress.id ? newAddr : addr,
        );
      } else {
        updatedAddresses = [...localAddresses, newAddr];
      }
      setLocalAddresses(updatedAddresses);
      setSelectedAddress(newAddr);
      setShowAddAddress(false);
      setShowSelectAddress(false);
      setEditingAddress(null);
      message.success(isEditing ? "Address updated" : "Address saved");
      if (typeof window !== "undefined") {
        localStorage.setItem("order_addresses", JSON.stringify(updatedAddresses));
      }
    }
  };

  const handleEditAddress = (addr: UserAddress) => {
    setEditingAddress(addr);
    setShowSelectAddress(false);
    setShowAddAddress(true);
  };

  const handlePlaceOrder = async () => {
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
      const applied = coupons.find((c) => c.code === appliedCoupon);
      const couponDiscountAmount = applied?.discountAmount ?? 0;
      const gstAmount = Math.round((totalPrice - couponDiscountAmount) * 0.05);
      const finalAmount = totalPrice - couponDiscountAmount + gstAmount;

      const receiverName = selectedAddress.receiverName ?? "";
      const receiverPhone = selectedAddress.receiverPhone ?? "";

      const orderPayload: Order = {
        paymentStatus: paymentMethod === "razorpay" ? "pending" : "pending",
        status: "pending",
        receiver: {
          name: isAuthenticated && user?.name ? user.name : receiverName,
          phone: isAuthenticated && user?.phone ? user.phone : receiverPhone,
          address: selectedAddress.address,
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
        couponCode: appliedCoupon ?? undefined,
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
            name: (isAuthenticated ? user?.name : null) ?? selectedAddress.receiverName ?? "",
            email: user?.email ?? "",
            contact: (isAuthenticated ? user?.phone : null) ?? selectedAddress.receiverPhone ?? "",
          },
          orderId: data.order?._id,
          onSuccess: () => {
            clearCart();
            router.push(
              `/success${data.order?._id ? `?orderId=${data.order._id}` : ""}`,
            );
          },
          onError: (error) => {
            message.error(error.message || "Payment failed");
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
    } finally {
      if (paymentMethod !== "razorpay") {
        setPlacingOrder(false);
      }
    }
  };

  const appliedCouponData = coupons.find((c) => c.code === appliedCoupon);
  const couponDiscount = appliedCouponData?.discountAmount ?? 0;
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
                <p className="font-semibold text-[#111] text-[15px]">Delivery at</p>
                {!selectedAddress ? (
                  <p className="text-sm text-[#737373] mt-1">Add delivery address</p>
                ) : (
                  <>
                    <p className="text-sm text-[#111] mt-1">{selectedAddress.address}</p>
                    <p className="text-sm font-semibold text-[#111] mt-0.5">{selectedAddress.pincode}</p>
                    {selectedAddress.receiverName && (
                      <p className="text-xs text-[#737373] mt-0.5">Deliver to: {selectedAddress.receiverName}</p>
                    )}
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSelectAddress(true)}
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
              Recommended Add Ons
            </p>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
              {recommendedProducts.map((product) => (
                <RecommendedItem key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl p-3 space-y-3">
          {coupons.length > 0 ? (
            coupons.map((coupon) => (
              <div key={coupon.code} className="flex items-start gap-2">
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
                      Save ₹{coupon.discountAmount} with &quot;{coupon.code}
                      &quot;
                    </p>
                    <button
                      type="button"
                      onClick={() => setAppliedCoupon(coupon.code)}
                      className="bg-[rgba(245,98,21,0.06)] border border-[#f56215] text-[#f56215] text-sm font-medium px-3 py-1 rounded-md"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500">No coupons available</p>
          )}
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
        <div className="bg-[#E1EBE8] rounded-t-2xl pt-2 pb-5 text-center">
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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  paymentMethod === "cash"
                    ? "bg-[#f56215] text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("razorpay")}
                className={`px-3 py-1 rounded-md text-sm font-medium ${
                  paymentMethod === "razorpay"
                    ? "bg-[#f56215] text-white"
                    : "bg-gray-100 text-gray-700"
                }`}
              >
                Online
              </button>
            </div>
          </div>
          <button
            type="button"
            className="bg-[#f56215] flex items-center gap-3 px-5 py-2.5 rounded-xl cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
            onClick={handlePlaceOrder}
            disabled={placingOrder || !selectedAddress}
          >
            <div className="flex flex-col items-start text-white">
              <span className="font-semibold">
                {placingOrder ? "Placing…" : "Place Order"}
              </span>
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
        }}
        onAddNew={() => {
          setEditingAddress(null);
          setShowSelectAddress(false);
          setShowAddAddress(true);
        }}
        onEdit={handleEditAddress}
      />
      <AddAddressSheet
        open={showAddAddress}
        onClose={() => {
          setShowAddAddress(false);
          setEditingAddress(null);
        }}
        onSave={handleSaveNewAddress}
        editAddress={editingAddress}
      />
    </main>
  );
}
