"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { useLocation } from "@/context/LocationContext";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import CartItem from "@/components/CartItem";
import RecommendedItem from "@/components/RecommendedItem";
// OLD address flow — disabled (replaced by DeliveryDetailsSheet)
// import SelectAddressSheet from "@/components/SelectAddressSheet";
// AddAddressSheet is now used internally by LocationSelector
import CouponSelector, {
  type AppliedCoupon,
} from "@/components/CouponSelector";
import { useRouter } from "next/navigation";
import { BUSINESS_LAT, BUSINESS_LNG } from "@/helpers/distance";
import { Order, type UserAddress } from "@/lib/types";
import { message } from "antd";
import type { Product } from "@/context/CartContext";
import { handleRazorpayPayment, type UpiApp } from "@/helpers/razorpay";
import { ArrowRightIcon, Info } from "lucide-react";
// OLD address flow — disabled (replaced by DeliveryDetailsSheet)
// import LocationSelector from "@/components/LocationSelector";
import DeliveryDetailsSheet, {
  type DeliveryDetails,
} from "@/components/DeliveryDetailsSheet";
import RewardInfoModal from "@/components/RewardInfoModal";
import {
  activeSlot,
  isDeliveryOpenNow,
  slotWindowLabel,
} from "@/lib/societySlots";
import {
  computeSocietyDiscount,
  offerDiscountBase,
} from "@/lib/societyDiscounts";
import {
  computeFirstOrderDiscount,
  resolveOfferDiscount,
} from "@/lib/firstOrderDiscount";
import { computeWalletApplied } from "@/lib/walletMath";
import {
  computePointsApplied,
  computePointsEarned,
  rewardBaseFor,
} from "@/lib/rewards";
import {
  DEFAULT_RULE,
  amountToFreeDelivery,
  computeDeliveryFee,
  ruleFor,
  type DeliveryFeeConfig,
} from "@/lib/deliveryFees";
import { DEFAULT_LADDER } from "@/lib/streakLadder";

const SAVED_DELIVERY_DETAILS_KEY = "sochmat_delivery_details";

type SavedDeliveryDetails = {
  name?: string;
  phone?: string;
  tower?: string;
  floor?: string;
  room?: string;
};

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
  const {
    distanceFromStoreKm,
    isServiceable,
    society,
    societyDiscountPercent,
  } = useLocation();
  const { user, setUser, isAuthenticated, isLoading: userLoading } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const {
    open: storeOpen,
    deliveryOn,
    loading: storeLoading,
  } = useStoreStatus();
  const router = useRouter();

  useEffect(() => {
    if (!storeLoading && !storeOpen) {
      message.info("Store is currently closed");
      router.replace("/");
    }
  }, [storeLoading, storeOpen, router]);

  useEffect(() => {
    if (!userLoading && !isAuthenticated) {
      openLoginPopup();
    }
  }, [userLoading, isAuthenticated, openLoginPopup]);
  const [selectedAddress, setSelectedAddress] = useState<UserAddress | null>(
    null,
  );
  const [localAddresses, setLocalAddresses] = useState<UserAddress[]>([]);
  // OLD address flow — disabled (replaced by DeliveryDetailsSheet)
  // const [showSelectAddress, setShowSelectAddress] = useState(false);
  // const [editingAddress, setEditingAddress] = useState<UserAddress | null>(
  //   null,
  // );
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(
    null,
  );
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(true);
  const [firstOrderEligible, setFirstOrderEligible] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [useWallet, setUseWallet] = useState(true);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [rewardNextStreak, setRewardNextStreak] = useState(1);
  const [rewardNextRate, setRewardNextRate] = useState(DEFAULT_LADDER[0]);
  const [rewardRates, setRewardRates] = useState<number[]>(DEFAULT_LADDER);
  const [rewardsEnabled, setRewardsEnabled] = useState(true);
  const [useRewardPoints, setUseRewardPoints] = useState(true);
  const [showRewardInfo, setShowRewardInfo] = useState(false);
  const [deliveryFeeConfig, setDeliveryFeeConfig] =
    useState<DeliveryFeeConfig | null>(null);
  /** This location's small-order rule; the built-in default until it loads. */
  const deliveryRule = deliveryFeeConfig
    ? ruleFor(deliveryFeeConfig, society.id)
    : DEFAULT_RULE;
  const [placingOrder, setPlacingOrder] = useState(false);
  const [showDeliveryDetails, setShowDeliveryDetails] = useState(false);
  // OLD address flow — disabled (replaced by DeliveryDetailsSheet)
  // const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [recommendedProducts, setRecommendedProducts] = useState<Product[]>([]);
  const [savedDeliveryDetails, setSavedDeliveryDetails] =
    useState<SavedDeliveryDetails | null>(null);
  const paymentMethod = "razorpay" as const;
  const selectedUpiApp: UpiApp | null = null;

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

  // Check first-order-discount eligibility + wallet balance, to preview them.
  // The order route re-checks/reserves authoritatively at creation.
  useEffect(() => {
    if (!isAuthenticated) {
      setFirstOrderEligible(false);
      setWalletBalance(0);
      setRewardPoints(0);
      setRewardNextStreak(1);
      setRewardNextRate(DEFAULT_LADDER[0]);
      setRewardRates(DEFAULT_LADDER);
      setRewardsEnabled(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [eligRes, walletRes, rewardsRes] = await Promise.all([
          fetch("/api/orders/first-order-eligibility", { cache: "no-store" }),
          fetch("/api/wallet/balance", { cache: "no-store" }),
          fetch(`/api/rewards/me?societyId=${encodeURIComponent(society.id)}`, {
            cache: "no-store",
          }),
        ]);
        const elig = await eligRes.json();
        const wallet = await walletRes.json();
        const rewards = await rewardsRes.json();
        if (!cancelled) {
          setFirstOrderEligible(!!elig?.eligible);
          setWalletBalance(Number(wallet?.balance ?? 0));
          setRewardPoints(Number(rewards?.points ?? 0));
          setRewardNextStreak(Number(rewards?.nextStreak ?? 1));
          setRewardNextRate(Number(rewards?.nextRate ?? DEFAULT_LADDER[0]));
          setRewardRates(
            Array.isArray(rewards?.rates) && rewards.rates.length
              ? (rewards.rates as number[])
              : DEFAULT_LADDER,
          );
          setRewardsEnabled(rewards?.enabled !== false);
        }
      } catch {
        if (!cancelled) {
          setFirstOrderEligible(false);
          setWalletBalance(0);
          setRewardPoints(0);
          setRewardNextStreak(1);
          setRewardNextRate(DEFAULT_LADDER[0]);
          setRewardRates(DEFAULT_LADDER);
          setRewardsEnabled(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, society.id]);

  // The offer doesn't run at every location (e.g. not at Pivotal Paradise), so
  // the selected society gates it on top of the per-user eligibility. Re-checked
  // authoritatively by the order route.
  const firstOrderOffered =
    firstOrderEligible && society.offersFirstOrderDiscount;

  // Small-order delivery fee rules. Public, so this runs signed out too — the
  // order route recomputes the fee authoritatively at creation either way.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/delivery-fees", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.default) return;
        setDeliveryFeeConfig({
          default: data.default,
          byLocation: data.byLocation ?? {},
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the last delivery details so the sheet pre-fills next time.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(SAVED_DELIVERY_DETAILS_KEY);
    if (!stored) return;
    try {
      setSavedDeliveryDetails(JSON.parse(stored) as SavedDeliveryDetails);
    } catch {
      // ignore malformed data
    }
  }, []);

  // OLD address flow — disabled (replaced by DeliveryDetailsSheet)
  // const addresses = isAuthenticated ? (user?.addresses ?? []) : localAddresses;

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

  const requireLogin = () => {
    if (!isAuthenticated) {
      openLoginPopup();
      return false;
    }
    return true;
  };

  // OLD address flow — disabled (replaced by DeliveryDetailsSheet)
  // const handleEditAddress = (addr: UserAddress) => {
  //   setEditingAddress(addr);
  //   setShowSelectAddress(false);
  //   setShowLocationSelector(true);
  // };

  const placeOrder = async (details: DeliveryDetails) => {
    if (!isAuthenticated) {
      openLoginPopup();
      return;
    }

    // Resolve receiver + address from the order type chosen in the sheet.
    let receiverName: string;
    let receiverPhone: string;
    let addressStr: string;
    let orderTypeFields: Partial<Order>;

    if (details.orderType === "delivery") {
      // Recompute the slot against a fresh clock: the cutoff may have passed
      // while the page sat open. No active slot → delivery is closed for now.
      const slot = activeSlot(society, new Date());
      if (society.slots.length > 0 && !slot) {
        message.error(
          `Delivery slots for ${society.name} are closed for now. Please choose Dine-in.`,
        );
        return;
      }
      receiverName = details.name;
      receiverPhone = details.phone;
      const slotSuffix = slot ? ` (delivery by ${slotWindowLabel(slot)})` : "";
      // Offices (e.g. Zomato) have no room number — omit that segment.
      const roomSegment = details.room ? `, Room ${details.room}` : "";
      addressStr = `${details.tower}, Floor ${details.floor}${roomSegment}, ${society.label}${slotSuffix}`;
      orderTypeFields = {
        orderType: "delivery",
        deliveryTower: details.tower,
        deliveryFloor: details.floor,
        ...(details.room ? { deliveryRoom: details.room } : {}),
        ...(slot ? { deliverySlot: slotWindowLabel(slot) } : {}),
      };
    } else {
      receiverName = details.name;
      receiverPhone = details.phone;
      addressStr = `Dine-in — pickup at ${society.label}`;
      orderTypeFields = { orderType: "dine-in" };
    }

    if (!receiverPhone) {
      message.error("A phone number is required to place the order");
      return;
    }

    // Persist the entered details so the sheet pre-fills on the next order.
    if (typeof window !== "undefined") {
      try {
        const toSave: SavedDeliveryDetails = {
          ...savedDeliveryDetails,
          name: receiverName,
          phone: receiverPhone,
          ...(details.orderType === "delivery"
            ? {
                tower: details.tower,
                floor: details.floor,
                room: details.room,
              }
            : {}),
        };
        localStorage.setItem(
          SAVED_DELIVERY_DETAILS_KEY,
          JSON.stringify(toSave),
        );
        setSavedDeliveryDetails(toSave);
      } catch {
        // ignore storage errors (e.g. private mode)
      }
    }

    setPlacingOrder(true);
    try {
      // Location discount: % of item subtotal, all order types, and it comes
      // off first — the offer below prices off what remains. Authoritatively
      // re-derived on the server from societyId.
      const societyDiscountAmount = computeSocietyDiscount(
        totalPrice,
        societyDiscountPercent,
      );
      const offerBase = offerDiscountBase(totalPrice, societyDiscountAmount);
      const couponDiscountAmount = appliedCoupon?.discountAmount ?? 0;
      // First-order 20% discount — best value vs the coupon (they don't stack).
      const firstOrderDiscountAmount = firstOrderOffered
        ? computeFirstOrderDiscount(offerBase)
        : 0;
      const { offerDiscount, firstOrderApplied } = resolveOfferDiscount(
        couponDiscountAmount,
        firstOrderDiscountAmount,
      );
      // When the first-order discount wins, the coupon (incl. any free item) is
      // not applied to this order.
      const couponActive = !firstOrderApplied && !!appliedCoupon;
      const discountedAmount = Math.max(
        0,
        totalPrice - offerDiscount - societyDiscountAmount,
      );
      const gstAmount = Math.round(discountedAmount * 0.05);
      // Delivery charge applies only to delivery orders (not dine-in).
      const deliveryFeeAmount =
        details.orderType === "delivery"
          ? computeDeliveryFee(totalPrice, deliveryRule)
          : 0;
      const finalAmount = discountedAmount + gstAmount + deliveryFeeAmount;

      const orderPayload: Order = {
        paymentStatus: "pending",
        status: "pending",
        userId: isAuthenticated && user?._id ? String(user._id) : undefined,
        ...orderTypeFields,
        receiver: {
          name: receiverName,
          phone: receiverPhone,
          address: addressStr,
          lat: BUSINESS_LAT,
          lng: BUSINESS_LNG,
        },
        address: addressStr,
        orderItems: [
          ...items.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
            price: item.price,
            variantName: item.variantName,
            addOns: item.selectedAddOns,
          })),
          // Free-item coupon grants an extra item at no charge (only when the
          // coupon is actually applied — not when superseded by first-order).
          ...(couponActive && appliedCoupon?.freeItem
            ? [
                {
                  productId: appliedCoupon.freeItem.id,
                  quantity: 1,
                  price: 0,
                },
              ]
            : []),
        ],
        totalAmount: finalAmount,
        discountAmount: couponActive ? couponDiscountAmount : 0,
        tax: gstAmount,
        deliveryFee: deliveryFeeAmount,
        societyId: society.id,
        societyDiscount: societyDiscountAmount,
        societyDiscountPercent: societyDiscountPercent,
        firstOrderDiscount: firstOrderApplied ? firstOrderDiscountAmount : 0,
        paymentMethod: paymentMethod,
        couponCode: couponActive ? appliedCoupon?.code : undefined,
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `useWallet`/`useRewardPoints` are request-only flags (not part of the
        // stored order).
        body: JSON.stringify({ ...orderPayload, useWallet, useRewardPoints }),
      });
      const data = await res.json();
      // The session died between page load and checkout. Toasting alone left
      // the UI insisting the customer was signed in while every order 401'd,
      // with no way out — drop the stale user and ask them to sign in again.
      if (res.status === 401) {
        setUser(null);
        message.error(data.message ?? "Please sign in to place an order");
        openLoginPopup();
        setPlacingOrder(false);
        return;
      }
      if (!data.success) {
        message.error(data.message ?? "Failed to place order");
        setPlacingOrder(false);
        return;
      }

      setShowDeliveryDetails(false);

      if (paymentMethod === "razorpay") {
        await handleRazorpayPayment({
          // Charge the server-authoritative payable (reduced by wallet credit),
          // falling back to the full amount when no wallet was applied.
          amount: Number(data.order?.netAmount ?? finalAmount),
          currency: "INR",
          name: "Sochmat",
          description: `Order #${data.order?.orderNumber || ""}`,
          prefill: {
            name: (isAuthenticated ? user?.name : "") || receiverName || "",
            email: user?.email || "vectorharsh@gmail.com",
            // The receiver on THIS order is the number to bill against — it's
            // required above, so it's always present, and it's what the customer
            // just typed. The account phone only fills a gap. Use || not ??: a
            // stored "" is missing, not a usable value.
            contact:
              receiverPhone || (isAuthenticated ? user?.phone : "") || "",
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
            const msg =
              error instanceof Error
                ? error.message
                : String(error ?? "Payment failed");
            console.error(error);
            setPlacingOrder(false);
            // A dismissed/cancelled checkout sheet keeps the user on the cart
            // so they can retry; a real failure routes to the failed page.
            if (/cancel/i.test(msg)) {
              message.error(msg || "Payment cancelled");
              return;
            }
            const params = new URLSearchParams();
            if (data.order?._id) params.set("orderId", String(data.order._id));
            if (msg) params.set("reason", msg);
            router.push(`/failed?${params.toString()}`);
          },
        });
      } else {
        clearCart();
        router.push(
          `/success${data.order?._id ? `?orderId=${data.order._id}` : ""}`,
        );
      }
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : "Failed to place order";
      message.error(msg);
      console.error(error);
    } finally {
      if (paymentMethod !== "razorpay") {
        setPlacingOrder(false);
      }
    }
  };

  // Flat location discount for the selected society (% of item subtotal). It
  // comes off first and the offer below prices off what remains, so the two
  // still stack. Authoritatively re-derived server-side.
  const societyDiscount = computeSocietyDiscount(
    totalPrice,
    societyDiscountPercent,
  );
  const offerBase = offerDiscountBase(totalPrice, societyDiscount);
  const couponDiscount = appliedCoupon?.discountAmount ?? 0;
  // First-order 20% discount — best value vs the coupon (they don't stack).
  const firstOrderDiscountPreview = firstOrderOffered
    ? computeFirstOrderDiscount(offerBase)
    : 0;
  const { offerDiscount, firstOrderApplied } = resolveOfferDiscount(
    couponDiscount,
    firstOrderDiscountPreview,
  );
  // A free-item coupon grants an item worth ₹0 instead of money off, so it never
  // moves the total — surface it in the bill or the coupon looks like it did
  // nothing. Suppressed when the first-order discount supersedes the coupon,
  // matching what placeOrder actually sends.
  const couponFreeItem = firstOrderApplied
    ? undefined
    : appliedCoupon?.freeItem;
  const couponSuperseded = firstOrderApplied && Boolean(appliedCoupon);
  const discountedSubtotal = Math.max(
    0,
    totalPrice - offerDiscount - societyDiscount,
  );
  const gst = Math.round(discountedSubtotal * 0.05);
  // Delivery is available only when the store allows it AND this society's slots
  // (if any) are still open. Societies without slots (e.g. Pivotal) are always
  // open. Recomputed authoritatively at order time in placeOrder.
  const slotsAllowDelivery = isDeliveryOpenNow(society, new Date());
  const deliveryAvailable = deliveryOn && slotsAllowDelivery;
  // Preview the delivery charge when delivery is available (the default choice);
  // dine-in orders drop it — the authoritative amount is recomputed in placeOrder.
  const deliveryFee = deliveryAvailable
    ? computeDeliveryFee(totalPrice, deliveryRule)
    : 0;
  // How much more food reaches free delivery; 0 once it already is.
  const freeDeliveryShortfall = deliveryAvailable
    ? amountToFreeDelivery(totalPrice, deliveryRule)
    : 0;
  const finalPrice = discountedSubtotal + gst + deliveryFee;
  const originalWithTax =
    Math.round(totalPrice + totalPrice * 0.05) + deliveryFee;
  // Wallet credit preview — reserved authoritatively server-side at creation.
  const walletApplied =
    useWallet && walletBalance > 0
      ? computeWalletApplied(walletBalance, finalPrice).walletApplied
      : 0;
  // Reward points apply to what's left after wallet credit, matching the order
  // route. Preview only — reserved authoritatively server-side at creation.
  const pointsApplied =
    useRewardPoints && rewardPoints > 0
      ? computePointsApplied(rewardPoints, finalPrice - walletApplied)
          .pointsApplied
      : 0;
  const payable = finalPrice - walletApplied - pointsApplied;
  // Points this order will earn: the streak rate off what the customer actually
  // pays, so it moves as wallet credit and points are toggled. Mirrors
  // rewardBaseFor, which the award path uses server-side.
  const pointsWillEarn = computePointsEarned(
    rewardBaseFor({ totalAmount: finalPrice, netAmount: payable }),
    rewardNextRate,
  );

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
        {/* OLD "Delivery at" address card — disabled; replaced by DeliveryDetailsSheet */}
        {/* <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
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
        </div> */}

        <div className="bg-white rounded-xl p-3 space-y-3">
          {items.map((item, index) => (
            <div key={item.cartItemId}>
              <CartItem item={item} />
              {index < items.length - 1 && (
                <div className="border-b border-gray-100 my-3" />
              )}
            </div>
          ))}

          {appliedCoupon?.freeItem && (
            <>
              <div className="border-b border-gray-100 my-3" />
              <div className="flex items-center justify-between gap-2 py-0.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-base shrink-0">🎁</span>
                  <p className="font-medium text-[15px] text-black truncate">
                    {appliedCoupon.freeItem.name}
                  </p>
                </div>
                <span className="text-[#00a86e] font-semibold text-sm shrink-0">
                  FREE
                </span>
              </div>
            </>
          )}

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
          discountBase={offerBase}
          societyId={society.id}
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
                  ₹{payable}
                </span>
                {offerDiscount || societyDiscount ? (
                  <span className="text-[#777] text-[13px] line-through">
                    ₹{originalWithTax}
                  </span>
                ) : null}
              </div>
              {offerDiscount || societyDiscount ? (
                <p className="text-[#00a86e] text-[11px] font-medium text-left">
                  ₹{originalWithTax - finalPrice} saved!
                </p>
              ) : null}
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
                    <span className="text-[#00a86e]">₹{totalPrice}</span>
                  </div>
                </div>
                {firstOrderApplied ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#666]">First order (20% off)</span>
                    <span className="text-[#00a86e]">₹{offerDiscount}</span>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#666]">Discount</span>
                    <span className="text-[#00a86e]">₹{couponDiscount}</span>
                  </div>
                )}
                {couponFreeItem ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#666]">
                      Free item ({couponFreeItem.name})
                    </span>
                    <span className="text-[#00a86e]">FREE</span>
                  </div>
                ) : null}
                {couponSuperseded ? (
                  <p className="text-xs text-[#999]">
                    Coupon not applied — your first-order discount saves more.
                  </p>
                ) : null}
                {societyDiscount > 0 ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#666]">
                      Location discount ({societyDiscountPercent}%)
                    </span>
                    <span className="text-[#00a86e]">₹{societyDiscount}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-sm">
                  <span className="text-[#666]">GST (5%)</span>
                  <span className="text-[#666] text-[13px]">₹{gst}</span>
                </div>
                {deliveryFee > 0 ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#666]">Delivery Charge</span>
                    <span className="text-[#666] text-[13px]">
                      ₹{deliveryFee}
                    </span>
                  </div>
                ) : null}
                {freeDeliveryShortfall > 0 ? (
                  <p className="text-xs text-[#f56215]">
                    Add ₹{freeDeliveryShortfall} more to get free delivery
                  </p>
                ) : null}
                {isAuthenticated && rewardsEnabled && pointsWillEarn > 0 ? (
                  <div className="rounded-lg bg-[#fff4ec] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-[#f56215]">
                        🔥 Day {rewardNextStreak} this month · earning{" "}
                        {rewardNextRate}%
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRewardInfo(true)}
                        className="-my-1 -mr-1 shrink-0 rounded-full p-1 text-[#f56215] transition-colors hover:bg-[#ffe0cb]"
                        aria-label="How reward points are calculated"
                      >
                        <Info className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="text-xs text-[#8a6b57] mt-0.5">
                      You&apos;ll earn {pointsWillEarn} points on this order
                      {rewardNextRate < 20
                        ? " — order again this month to earn more"
                        : " — you're at this month's maximum rate"}
                      . Points can be redeemed on next order
                    </div>
                  </div>
                ) : null}
                {walletBalance > 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 text-[#666]">
                      <input
                        type="checkbox"
                        checked={useWallet}
                        onChange={(e) => setUseWallet(e.target.checked)}
                        className="h-4 w-4 accent-[#f56215]"
                      />
                      Use wallet credit (₹{walletBalance})
                    </label>
                    {walletApplied > 0 ? (
                      <span className="text-[#00a86e]">−₹{walletApplied}</span>
                    ) : (
                      <span className="text-[#bbb] text-[13px]">₹0</span>
                    )}
                  </div>
                ) : null}
                {rewardPoints > 0 ? (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center gap-2 text-[#666]">
                      <input
                        type="checkbox"
                        checked={useRewardPoints}
                        onChange={(e) => setUseRewardPoints(e.target.checked)}
                        className="h-4 w-4 accent-[#f56215]"
                      />
                      Use reward points ({rewardPoints})
                    </label>
                    {pointsApplied > 0 ? (
                      <span className="text-[#00a86e]">−₹{pointsApplied}</span>
                    ) : (
                      <span className="text-[#bbb] text-[13px]">₹0</span>
                    )}
                  </div>
                ) : null}
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
              setShowDeliveryDetails(true);
            }}
            disabled={placingOrder}
          >
            <div className="flex flex-col items-start text-white">
              <span className="font-semibold">
                {placingOrder ? "Placing…" : "Place Order"}
              </span>
              <span className="font-medium text-sm">₹{payable}</span>
            </div>
            <ArrowRightIcon className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      <RewardInfoModal
        open={showRewardInfo}
        onClose={() => setShowRewardInfo(false)}
        rates={rewardRates}
        currentDay={rewardNextStreak}
      />

      {showDeliveryDetails && (
        <DeliveryDetailsSheet
          open
          society={society}
          onClose={() => setShowDeliveryDetails(false)}
          // Account first, now that every account has a phone. `||` not `??`,
          // so a legacy empty string falls through instead of winning.
          defaultName={
            user?.name ||
            savedDeliveryDetails?.name ||
            selectedAddress?.receiverName ||
            ""
          }
          defaultPhone={
            user?.phone ||
            savedDeliveryDetails?.phone ||
            selectedAddress?.receiverPhone ||
            ""
          }
          defaultTower={savedDeliveryDetails?.tower ?? ""}
          defaultFloor={savedDeliveryDetails?.floor ?? ""}
          defaultRoom={savedDeliveryDetails?.room ?? ""}
          submitting={placingOrder}
          deliveryAvailable={deliveryAvailable}
          onConfirm={placeOrder}
        />
      )}

      {/* OLD address sheets — disabled; replaced by DeliveryDetailsSheet
      <SelectAddressSheet
        open={showSelectAddress}
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
              // ignore
            }
          }
        }}
      />
      */}
    </main>
  );
}
