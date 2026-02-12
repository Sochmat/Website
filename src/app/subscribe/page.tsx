"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { useLocation } from "@/context/LocationContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import SelectAddressSheet from "@/components/SelectAddressSheet";
import AddAddressSheet from "@/components/AddAddressSheet";
import { distanceFromBusinessKm, isWithinServiceArea } from "@/helpers/distance";
import { type UserAddress } from "@/lib/types";
import { message } from "antd";
import { handleRazorpayPayment } from "@/helpers/razorpay";

interface SubscribeProduct {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  price: number;
  originalPrice: number;
  discount?: string;
  image: string;
  isVeg: boolean;
}

export default function SubscribePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get("productId");
  const { user, isAuthenticated, setUser } = useUser();
  const { distanceFromStoreKm } = useLocation();
  const { openLoginPopup } = useLoginPopup();
  const [product, setProduct] = useState<SubscribeProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantityOption, setQuantityOption] = useState<"300ml" | "500ml">("300ml");
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [deliveryTime, setDeliveryTime] = useState("08:00");
  const [duration, setDuration] = useState<"week" | "month">("month");
  const [frequency, setFrequency] = useState<"daily" | "alternate">("daily");
  const [selectedAddress, setSelectedAddress] = useState<UserAddress | null>(null);
  const [showSelectAddress, setShowSelectAddress] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "razorpay">("cash");
  const [placingSubscription, setPlacingSubscription] = useState(false);

  const fetchProduct = useCallback(async () => {
    if (!productId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/menu");
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        const item = data.items.find((i: { id: string }) => i.id === productId);
        if (item) {
          setProduct({
            id: item.id,
            name: item.name,
            kcal: item.kcal,
            protein: item.protein,
            price: item.price,
            originalPrice: item.originalPrice,
            discount: item.discount,
            image: item.image,
            isVeg: item.isVeg,
          });
        }
      }
    } catch {
      setProduct(null);
    }
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const addresses = user?.addresses ?? [];
  useEffect(() => {
    if (isAuthenticated && addresses.length > 0 && !selectedAddress) {
      setSelectedAddress(addresses[0]);
    }
  }, [isAuthenticated, addresses.length, selectedAddress]);

  const selectedAddressServiceable = selectedAddress
    ? isWithinServiceArea(selectedAddress.lat, selectedAddress.long)
    : null;
  const selectedAddressDistance = selectedAddress
    ? distanceFromBusinessKm(selectedAddress.lat, selectedAddress.long)
    : null;

  const handleSaveNewAddress = async (newAddr: UserAddress) => {
    if (!user?._id) return;
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _id: user._id,
          addresses: [...(user.addresses ?? []), newAddr],
        }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        setSelectedAddress(newAddr);
        setShowAddAddress(false);
        setShowSelectAddress(false);
        message.success("Address saved");
      } else {
        message.error(data.message ?? "Failed to save address");
      }
    } catch {
      message.error("Failed to save address");
    }
  };

  const handlePlaceSubscription = async () => {
    if (!product) {
      message.error("Product not found");
      return;
    }
    if (!isAuthenticated || !user) {
      message.error("Please log in to subscribe");
      openLoginPopup();
      return;
    }
    if (!selectedAddress) {
      message.error("Please select a delivery address");
      setShowSelectAddress(true);
      return;
    }
    if (selectedAddressServiceable === false) {
      message.error(
        `Delivery not available at this address. You're ${selectedAddressDistance?.toFixed(1)} km away; we deliver within 10 km only.`,
      );
      return;
    }
    setPlacingSubscription(true);
    try {
      const gstAmount = Math.round(product.price * 0.05);
      const finalAmount = product.price + gstAmount;

      const subscriptionPayload = {
        productId: product.id,
        quantityOption,
        deliveryDate,
        deliveryTime,
        duration,
        frequency,
        receiver: {
          name: user.name ?? selectedAddress.receiverName ?? "",
          phone: user.phone,
          address: selectedAddress.address,
        },
        totalAmount: finalAmount,
        tax: gstAmount,
        paymentMethod: paymentMethod,
      };

      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscriptionPayload),
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.message ?? "Failed to create subscription");
        return;
      }

      if (paymentMethod === "razorpay") {
        await handleRazorpayPayment({
          amount: finalAmount,
          currency: "INR",
          name: "Sochmat",
          description: `Subscription #${data.subscription?.subscriptionNumber || ""}`,
          prefill: {
            name: user.name ?? selectedAddress.receiverName ?? "",
            email: user.email ?? "",
            contact: user.phone,
          },
          orderId: data.subscription?._id,
          onSuccess: () => {
            router.push(
              `/success${data.subscription?._id ? `?subscriptionId=${data.subscription._id}` : ""}`,
            );
          },
          onError: (error) => {
            message.error(error.message || "Payment failed");
            setPlacingSubscription(false);
          },
        });
      } else {
        router.push(
          `/success${data.subscription?._id ? `?subscriptionId=${data.subscription._id}` : ""}`,
        );
      }
    } catch (error: any) {
      message.error(error.message || "Failed to create subscription");
    } finally {
      if (paymentMethod !== "razorpay") {
        setPlacingSubscription(false);
      }
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto p-4">
        <Link href="/menu" className="inline-flex items-center gap-2 text-[#111] font-medium">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <p className="mt-4 text-gray-500">Product not found.</p>
      </main>
    );
  }

  const discountPct = product.originalPrice > 0
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <Link
          href="/menu"
          className="p-2 -ml-2 text-[#111] rounded-lg hover:bg-gray-100"
          aria-label="Back"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-bold text-[#111]">Subscribe</h1>
      </header>

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex gap-3">
            <div
              className={`w-4 h-4 border-2 shrink-0 mt-0.5 ${
                product.isVeg ? "border-green-600" : "border-red-600"
              } flex items-center justify-center`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  product.isVeg ? "bg-green-600" : "bg-red-600"
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-[#111]">{product.name}</h2>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-xs font-semibold px-2.5 py-1 rounded-full">
                  {product.kcal} kcal
                </span>
                <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-xs font-semibold px-2.5 py-1 rounded-full">
                  {product.protein}g Protein
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="font-semibold text-[#111]">₹{product.price}/-</span>
              {product.originalPrice > product.price && (
                <>
                  <span className="text-gray-400 text-sm line-through ml-1">₹{product.originalPrice}/-</span>
                  {discountPct > 0 && (
                    <span className="block text-[#009940] text-xs font-medium mt-0.5">{discountPct}% off</span>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
            {(["300ml", "500ml"] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="quantity"
                  checked={quantityOption === opt}
                  onChange={() => setQuantityOption(opt)}
                  className="w-4 h-4 text-[#f56215] focus:ring-[#f56215]"
                />
                <span className="text-sm font-medium text-[#111]">{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-[#111] mb-3">Delivery schedule</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Select delivery date</label>
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Select delivery time</label>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <span className="block text-xs text-gray-500 mb-2">Duration</span>
              <div className="flex gap-4">
                {(["week", "month"] as const).map((d) => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="duration"
                      checked={duration === d}
                      onChange={() => setDuration(d)}
                      className="w-4 h-4 text-[#f56215] focus:ring-[#f56215]"
                    />
                    <span className="text-sm font-medium text-[#111]">For a {d}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="block text-xs text-gray-500 mb-2">Frequency</span>
              <div className="flex gap-4">
                {(["daily", "alternate"] as const).map((f) => (
                  <label key={f} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="frequency"
                      checked={frequency === f}
                      onChange={() => setFrequency(f)}
                      className="w-4 h-4 text-[#f56215] focus:ring-[#f56215]"
                    />
                    <span className="text-sm font-medium text-[#111] capitalize">{f}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <svg className="w-5 h-5 text-[#111] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div>
                <p className="font-semibold text-[#111] text-[15px]">Delivery at</p>
                {!isAuthenticated ? (
                  <p className="text-sm text-[#737373] mt-1">Login to set delivery address</p>
                ) : !selectedAddress ? (
                  <p className="text-sm text-[#737373] mt-1">Select delivery address</p>
                ) : (
                  <>
                    <p className="text-sm text-[#111] mt-1">{selectedAddress.address}</p>
                    <p className="text-sm font-semibold text-[#111] mt-0.5">{selectedAddress.pincode}</p>
                  </>
                )}
              </div>
            </div>
            {!isAuthenticated ? (
              <button
                type="button"
                onClick={openLoginPopup}
                className="text-[#f56215] font-semibold text-sm underline shrink-0"
              >
                Login
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowSelectAddress(true)}
                className="text-[#f56215] font-semibold text-sm underline shrink-0"
              >
                Change
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-[#111]">To Pay ₹{product.price + Math.round(product.price * 0.05)}</p>
              {product.originalPrice > product.price && (
                <p className="text-[#009940] text-sm mt-0.5">₹{product.originalPrice - product.price} saved!</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-100 p-4 flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-2 mt-1">
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
          onClick={handlePlaceSubscription}
          disabled={placingSubscription || !isAuthenticated || !selectedAddress}
        >
          <div className="flex flex-col items-start text-white">
            <span className="font-semibold">
              {placingSubscription ? "Placing…" : "Subscribe"}
            </span>
            <span className="font-medium text-sm">₹{product.price + Math.round(product.price * 0.05)}</span>
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

      <SelectAddressSheet
        open={showSelectAddress && !showAddAddress}
        onClose={() => setShowSelectAddress(false)}
        addresses={addresses}
        selectedAddress={selectedAddress}
        onSelect={(addr) => {
          setSelectedAddress(addr);
          setShowSelectAddress(false);
        }}
        onAddNew={() => {
          setShowSelectAddress(false);
          setShowAddAddress(true);
        }}
      />
      <AddAddressSheet
        open={showAddAddress}
        onClose={() => setShowAddAddress(false)}
        onSave={handleSaveNewAddress}
      />
    </main>
  );
}
