"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { message } from "antd";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  MapPin,
  Pencil,
  Phone,
  PlayCircle,
  Plus,
  ReceiptText,
  UtensilsCrossed,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import SelectAddressSheet from "@/components/SelectAddressSheet";
import LocationSelector from "@/components/LocationSelector";
import IngredientsSheet from "@/components/IngredientsSheet";
import Footer from "@/components/Footer";
import { handleRazorpayPayment } from "@/helpers/razorpay";
import {
  distanceFromBusinessKm,
  isWithinServiceArea,
} from "@/helpers/distance";
import { GST_RATE } from "@/lib/subscription";
import {
  MEALS_PER_PLAN,
  effectivePricePerMeal,
  discountPercent,
} from "@/lib/subscriptionBrackets";
import { isBracketKey, isDiet } from "@/lib/subscriptionBrackets";
import type {
  ProteinBracketKey,
  SubscriptionDiet,
  UserAddress,
} from "@/lib/types";
import BracketCard from "@/components/subscription/BracketCard";
import DietCard from "@/components/subscription/DietCard";
import MealOptionsSheet from "@/components/subscription/MealOptionsSheet";
import DeliveryTimePicker from "@/components/subscription/DeliveryTimePicker";
import SubscriptionItemCard from "@/components/subscription/SubscriptionItemCard";
import {
  rupees,
  TIER_LABELS,
  toProduct,
  type BracketOption,
  type SubscriptionItem,
} from "@/components/subscription/types";

// The price we charge — bracket discount applied — kept in lockstep with the
// server's computeBracketPlanTotals so the shown total equals the charged one.
function priceForDiet(b: BracketOption, diet: SubscriptionDiet) {
  return effectivePricePerMeal(b, diet);
}

// The pre-discount list price, for a struck-through "was" figure.
function listPriceForDiet(b: BracketOption, diet: SubscriptionDiet) {
  return diet === "veg-nonveg" ? b.nonVegPrice : b.vegPrice;
}

function sameAddr(a: UserAddress, b: UserAddress): boolean {
  if (a.id && b.id) return a.id === b.id;
  return a.address === b.address && a.pincode === b.pincode;
}

/** Addresses a guest saved before logging in (AddAddressSheet writes these). */
const GUEST_ADDR_KEY = "order_addresses";
function readGuestAddresses(): UserAddress[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(GUEST_ADDR_KEY);
    return stored ? (JSON.parse(stored) as UserAddress[]) : [];
  } catch {
    return [];
  }
}

function PurchaseWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isAuthenticated, setUser } = useUser();
  const { openLoginPopup } = useLoginPopup();

  // The wizard step lives in the URL, so browser Back works and — critically —
  // the login-popup round-trip can't wipe the customer's choices.
  const bracketKey = params.get("bracket");
  const dietParam = params.get("diet");
  const bracket: ProteinBracketKey | null = isBracketKey(bracketKey)
    ? bracketKey
    : null;
  const diet: SubscriptionDiet | null = isDiet(dietParam) ? dietParam : null;
  const step: "bracket" | "diet" | "browse" = !bracket
    ? "bracket"
    : !diet
    ? "diet"
    : "browse";

  const [brackets, setBrackets] = useState<BracketOption[]>([]);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  // null = not fetched for the current bracket+diet yet.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Meal-option counts for the diet screen. Tagged with the bracket they were
  // fetched for so a stale count never shows after switching brackets. `all`
  // includes veg + non-veg; `veg` is the vegetarian subset.
  const [dietCounts, setDietCounts] = useState<{
    bracket: string;
    veg: number;
    all: number;
  } | null>(null);

  // Empty until the customer picks one, so the Buy button can require it.
  const [deliveryTime, setDeliveryTime] = useState("");
  const [pickedAddress, setPickedAddress] = useState<UserAddress | null>(null);
  const [showSelectAddress, setShowSelectAddress] = useState(false);
  // The full-screen Google-map picker (search + drag pin + GPS), used for both
  // adding and editing. It embeds AddAddressSheet for the flat/receiver details.
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(
    null
  );
  const [placing, setPlacing] = useState(false);
  // The item whose description sheet is open (browse step).
  const [detailItem, setDetailItem] = useState<SubscriptionItem | null>(null);
  // Meal preview is a collapsible teaser — the real picking happens after payment.
  const [mealsOpen, setMealsOpen] = useState(false);
  // "View meal options" sheet on the bracket picker: the tier being previewed
  // plus its (lazily-fetched) meals.
  const [optionsBracket, setOptionsBracket] = useState<{
    bracket: BracketOption;
    index: number;
  } | null>(null);
  const [optionsItems, setOptionsItems] = useState<SubscriptionItem[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  // Addresses a guest added before signing in, read from localStorage.
  const [guestAddresses, setGuestAddresses] = useState<UserAddress[]>([]);
  // Set when Buy is tapped while logged out, so the purchase auto-resumes once
  // the login modal reports success.
  const pendingBuyRef = useRef(false);
  // Guards the one-time "ask for location" prompt on entering the browse step.
  const promptedAddressRef = useRef(false);

  useEffect(() => {
    fetch("/api/subscriptions/brackets")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setBrackets(d.brackets as BracketOption[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bracket || !diet) return;
    const key = `${bracket}|${diet}`;
    let cancelled = false;
    fetch(`/api/subscriptions/menu?bracket=${bracket}&diet=${diet}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.success) setItems(d.items as SubscriptionItem[]);
        setLoadedFor(key);
      })
      .catch(() => {
        if (!cancelled) setLoadedFor(key);
      });
    return () => {
      cancelled = true;
    };
  }, [bracket, diet]);

  // On the diet screen we don't know the diet yet, so pull the full list once
  // (veg-nonveg = every item) and split it into veg / total counts.
  useEffect(() => {
    if (!bracket) return;
    let cancelled = false;
    fetch(`/api/subscriptions/menu?bracket=${bracket}&diet=veg-nonveg`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.success) return;
        const all = d.items as SubscriptionItem[];
        setDietCounts({
          bracket,
          veg: all.filter((it) => it.isVeg).length,
          all: all.length,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bracket]);

  const itemsLoading =
    !!bracket && !!diet && loadedFor !== `${bracket}|${diet}`;

  const bracketIndex = useMemo(
    () => brackets.findIndex((b) => b.key === bracket),
    [brackets, bracket]
  );
  const selectedBracket = bracketIndex >= 0 ? brackets[bracketIndex] : null;
  // Plan name is the bracket's rung on the protein ladder, not its DB label.
  const planName =
    bracketIndex >= 0 ? TIER_LABELS[bracketIndex] ?? TIER_LABELS[0] : "";

  const totals = useMemo(() => {
    if (!selectedBracket || !diet) return null;
    const per = priceForDiet(selectedBracket, diet);
    const listPer = listPriceForDiet(selectedBracket, diet);
    const subtotal = per * MEALS_PER_PLAN;
    const listSubtotal = listPer * MEALS_PER_PLAN;
    const tax = Math.round(subtotal * GST_RATE);
    return {
      per,
      listPer,
      subtotal,
      listSubtotal,
      // Pre-tax rupees saved by the bracket discount (0 when none).
      discount: listSubtotal - subtotal,
      discountPercent: discountPercent(selectedBracket, diet),
      tax,
      total: subtotal + tax,
    };
  }, [selectedBracket, diet]);

  const addresses = useMemo(
    () => (isAuthenticated ? user?.addresses ?? [] : guestAddresses),
    [isAuthenticated, user?.addresses, guestAddresses]
  );
  const selectedAddress = pickedAddress ?? addresses[0] ?? null;
  const addressServiceable = selectedAddress
    ? isWithinServiceArea(selectedAddress.lat, selectedAddress.long)
    : null;

  // Adding a 2nd+ address reuses the receiver from an existing one, so the
  // customer isn't asked for their name and number again.
  const sharedReceiver = useMemo(() => {
    if (editingAddress || addresses.length === 0) return null;
    const src = addresses.find((a) => a.receiverName && a.receiverPhone);
    const name = src?.receiverName ?? user?.name;
    const phone = src?.receiverPhone ?? user?.phone;
    return name && phone ? { name, phone } : null;
  }, [editingAddress, addresses, user?.name, user?.phone]);

  // Ask for the delivery location as soon as the customer lands on the browse
  // step with no address on file — so serviceability is known up front, not at
  // the final Buy tap. Fire once, and only after auth/user state has settled.
  const userReady = !isAuthenticated || !!user;
  useEffect(() => {
    if (step !== "browse" || promptedAddressRef.current || !userReady) return;
    if (selectedAddress) return;
    promptedAddressRef.current = true;
    setEditingAddress(null);
    setShowLocationSelector(true);
  }, [step, userReady, selectedAddress]);

  // Resume a purchase that was interrupted by the login modal.
  useEffect(() => {
    if (isAuthenticated && pendingBuyRef.current) {
      pendingBuyRef.current = false;
      // Defer out of the effect body so the click path (not a render) drives it.
      void Promise.resolve().then(() => handleBuy());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Load addresses a guest saved before signing in (deferred to dodge a
  // hydration mismatch and a synchronous setState-in-effect).
  useEffect(() => {
    if (isAuthenticated) return;
    void Promise.resolve().then(() => setGuestAddresses(readGuestAddresses()));
  }, [isAuthenticated]);

  // On login, fold any guest addresses into the profile (deduped, capped at 2),
  // then clear the guest store.
  useEffect(() => {
    if (!isAuthenticated || !user?._id) return;
    const guest = readGuestAddresses();
    if (guest.length === 0) return;
    const existing = user.addresses ?? [];
    const merged = [...existing];
    for (const g of guest) {
      if (merged.length >= 2) break;
      if (!merged.some((a) => sameAddr(a, g))) merged.push(g);
    }
    const done = () => {
      if (typeof window !== "undefined")
        localStorage.removeItem(GUEST_ADDR_KEY);
    };
    if (merged.length === existing.length) {
      done();
      return;
    }
    fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _id: user._id, addresses: merged }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d.user) setUser(d.user);
      })
      .catch(() => {})
      .finally(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?._id]);

  const go = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/subscription?${sp.toString()}`);
  };

  // Preview a bracket's meals without leaving the picker. Lazily fetches the
  // full (veg + non-veg) list for that bracket.
  const openOptions = (b: BracketOption, i: number) => {
    setOptionsBracket({ bracket: b, index: i });
    setOptionsItems([]);
    setOptionsLoading(true);
    fetch(`/api/subscriptions/menu?bracket=${b.key}&diet=veg-nonveg`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setOptionsItems(d.items as SubscriptionItem[]);
      })
      .catch(() => {})
      .finally(() => setOptionsLoading(false));
  };

  // The map picker's embedded AddAddressSheet has already persisted the address
  // (PATCH /api/users + UserContext.setUser for signed-in users, or localStorage
  // for guests). Here we just adopt it as the plan's delivery address.
  const handleAddressSaved = (addr: UserAddress) => {
    setPickedAddress(addr);
    // A guest's new address was just written to localStorage — reflect it in the list.
    if (!isAuthenticated) setGuestAddresses(readGuestAddresses());
    setShowLocationSelector(false);
    setShowSelectAddress(false);
    setEditingAddress(null);
  };

  const handleBuy = async () => {
    if (!bracket || !diet || !totals) return;
    if (!isAuthenticated) {
      // Remember the intent so the purchase auto-continues after login.
      pendingBuyRef.current = true;
      openLoginPopup();
      return;
    }
    if (!selectedAddress) {
      message.error("Please select a delivery address");
      setShowSelectAddress(true);
      return;
    }
    // Fall back to the profile so pre-existing addresses without receiver
    // details don't force a detour through the map picker.
    const receiverName = selectedAddress.receiverName || user?.name;
    const receiverPhone = selectedAddress.receiverPhone || user?.phone;
    if (!receiverName || !receiverPhone) {
      message.error("Please enter receiver name and phone");
      setEditingAddress(selectedAddress);
      setShowLocationSelector(true);
      return;
    }
    if (addressServiceable === false) {
      const dist = distanceFromBusinessKm(
        selectedAddress.lat,
        selectedAddress.long
      );
      message.error(
        `Delivery not available here. You're ${dist.toFixed(
          1
        )} km away; we deliver within 10 km.`
      );
      return;
    }

    setPlacing(true);
    try {
      const res = await fetch("/api/subscriptions/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bracket,
          diet,
          deliveryTime,
          receiver: {
            name: receiverName,
            phone: receiverPhone,
            address: selectedAddress.address,
            lat: selectedAddress.lat,
            long: selectedAddress.long,
          },
        }),
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.message ?? "Failed to create plan");
        setPlacing(false);
        return;
      }

      const planId = data.plan._id;
      await handleRazorpayPayment({
        amount: data.plan.totalAmount,
        currency: "INR",
        name: "Sochmat Subscription",
        description: `Plan ${data.plan.planNumber}`,
        prefill: {
          name: receiverName,
          email: "",
          contact: receiverPhone,
        },
        // Server-side verification is the ONLY path to paid; no client PATCH.
        verifyUrl: "/api/subscriptions/plans/verify",
        verifyBody: { planId },
        failUrl: null,
        onSuccess: () => router.push(`/subscription/success?planId=${planId}`),
        onError: (err) => {
          message.error(err.message || "Payment failed");
          setPlacing(false);
        },
      });
    } catch (e) {
      message.error((e as Error).message || "Failed to create plan");
      setPlacing(false);
    }
  };

  // The bracket picker is the subscription home: three tiers that fill the
  // screen. It gets its own bare shell — no sub-header, no padding — so the
  // bands own the whole viewport below the account bar (56px / 3.5rem).
  if (step === "bracket") {
    return (
      <main className="bg-[#f5f5f5] max-w-[430px] mx-auto">
        <div className="flex min-h-[480px] h-[calc(100dvh-4rem)] flex-col divide-y divide-black/10">
          {brackets.length === 0
            ? [0, 1, 2].map((i) => (
                <div key={i} className="flex-1 animate-pulse bg-gray-200/70" />
              ))
            : brackets.map((b, i) => (
                <BracketCard
                  key={b.key}
                  bracket={b}
                  index={i}
                  onSelect={() => go({ bracket: b.key })}
                  onViewOptions={() => openOptions(b, i)}
                />
              ))}
        </div>

        {/* Need help — a call-us line plus a "how to subscribe" demo video,
            below the tier bands. */}
        <section className="border-t border-black/10 bg-white px-4 pt-6 pb-14">
          <h2 className="text-center text-base font-bold text-[#111]">
            Need help?
          </h2>
          <p className="mt-1 text-center text-xs text-[#737373]">
            We&apos;re happy to walk you through it before you subscribe.
          </p>

          <div className="mt-4 space-y-3">
            {/* Demo: how to buy a subscription. Placeholder embed URL — swap
                the src for the real video later. */}
            <div className="relative w-full overflow-hidden rounded-xl border border-gray-100 bg-black pt-[56.25%]">
              <iframe
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="How to buy a subscription"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
            <p className="text-center text-sm font-medium text-[#737373]">or</p>
            <a
              href="tel:+919759399537"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f56215] py-3.5 text-base font-semibold text-white active:bg-[#e05610]"
            >
              <Phone className="h-5 w-5" />
              Call us
            </a>
          </div>
        </section>

        <Footer />

        {/* Mounted only while previewing, so the Veg/Non-veg toggle resets each open. */}
        {optionsBracket && (
          <MealOptionsSheet
            open
            onClose={() => setOptionsBracket(null)}
            onChoose={() => {
              const key = optionsBracket.bracket.key;
              setOptionsBracket(null);
              go({ bracket: key });
            }}
            title={TIER_LABELS[optionsBracket.index] ?? ""}
            subtitle={`${optionsBracket.bracket.proteinMin}–${optionsBracket.bracket.proteinMax}g protein`}
            items={optionsItems}
            loading={optionsLoading}
            vegPrice={effectivePricePerMeal(optionsBracket.bracket, "veg")}
            nonVegPrice={effectivePricePerMeal(
              optionsBracket.bracket,
              "veg-nonveg"
            )}
          />
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-40">
      <header className="sticky top-16 z-10 bg-white border-b border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 text-sm text-[#f56215] font-semibold mb-2 hover:gap-1.5 transition-all"
        >
          ← Back
        </button>
        {/* Same plan-name header on every step below the bracket picker. */}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold text-[#111] leading-none">
            {planName}
          </h1>
          {selectedBracket && (
            <span className="inline-flex items-baseline gap-0.5 rounded-full bg-[#fff1e8] px-2.5 py-1 text-sm font-bold text-[#c2410c]">
              {selectedBracket.proteinMin}–{selectedBracket.proteinMax}
              <span className="text-[11px] font-semibold">g protein</span>
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1.5">
          7 meals · schedule any 7 days in the next 30
        </p>
      </header>

      <div className="p-4 space-y-3">
        {step === "diet" && selectedBracket && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9a9a9a] px-1">
              Choose your plan type
            </p>
            {(["veg", "veg-nonveg"] as SubscriptionDiet[]).map((d) => {
              const per = priceForDiet(selectedBracket, d);
              const subtotal = per * MEALS_PER_PLAN;
              const total = subtotal + Math.round(subtotal * GST_RATE);
              const counts =
                dietCounts?.bracket === bracket ? dietCounts : null;
              return (
                <DietCard
                  key={d}
                  diet={d}
                  pricePerMeal={per}
                  listPricePerMeal={listPriceForDiet(selectedBracket, d)}
                  discountPercent={discountPercent(selectedBracket, d)}
                  totalPrice={total}
                  optionCount={
                    counts ? (d === "veg" ? counts.veg : counts.all) : null
                  }
                  mealsPerPlan={MEALS_PER_PLAN}
                  onSelect={() => go({ diet: d })}
                />
              );
            })}
          </>
        )}

        {step === "browse" && totals && (
          <>
            {/* Meals in this plan — collapsible teaser (real picking is post-payment).
                Given an accent treatment so the preview is easy to spot. */}
            <div
              className={`rounded-2xl overflow-hidden transition-colors ${
                mealsOpen
                  ? "bg-white shadow-sm ring-1 ring-black/5"
                  : "bg-[#fff4ec] ring-1 ring-[#f56215]/30 shadow-sm"
              }`}
            >
              <button
                type="button"
                onClick={() => setMealsOpen((o) => !o)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
              >
                <span className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f56215]/15 text-[#f56215]">
                    <UtensilsCrossed className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-[#111]">
                      Meals in this plan
                      {!itemsLoading && items.length > 0 && (
                        <span className="ml-1.5 text-xs font-semibold text-[#c2410c]">
                          {items.length} options
                        </span>
                      )}
                    </span>
                    <span className="block text-xs text-[#9a7458]">
                      {mealsOpen
                        ? "Tap to hide"
                        : "Tap to preview what you'll get"}
                    </span>
                  </span>
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f56215] text-white">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      mealsOpen ? "rotate-180" : ""
                    }`}
                  />
                </span>
              </button>
              {mealsOpen && (
                <div className="px-4 pb-4">
                  {itemsLoading ? (
                    <div className="space-y-2">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="h-28 rounded-xl bg-gray-200/70 animate-pulse"
                        />
                      ))}
                    </div>
                  ) : items.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No meals available yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {items.map((it) => (
                        <SubscriptionItemCard
                          key={it.id}
                          item={it}
                          subscriptionPrice={totals.per}
                          // Item detail sheet disabled for now — no onTap so the
                          // card renders as a plain (non-clickable) card.
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Delivery address — all saved addresses, pick one for this order */}
            <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
              <p className="flex items-center gap-1.5 font-semibold text-[#111]">
                <MapPin className="h-4 w-4 text-[#f56215]" /> Delivery address
              </p>

              {addresses.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {addresses.map((addr) => {
                    const isSel =
                      !!selectedAddress && sameAddr(addr, selectedAddress);
                    const serviceable = isWithinServiceArea(
                      addr.lat,
                      addr.long
                    );
                    return (
                      <div
                        key={addr.id ?? addr.address}
                        className={`relative rounded-xl border transition-colors ${
                          isSel
                            ? "border-[#f56215] bg-[#fff4ec]"
                            : "border-gray-200"
                        }`}
                      >
                        {/* Full-card select target beneath the content, so a tap
                            anywhere but the Edit button picks this address. */}
                        <button
                          type="button"
                          onClick={() => setPickedAddress(addr)}
                          aria-label="Use this address"
                          className="absolute inset-0 z-[1] rounded-xl outline-none"
                        />
                        <div className="pointer-events-none relative z-[2] flex gap-3 p-3">
                          <span
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                              isSel ? "border-[#f56215]" : "border-gray-300"
                            }`}
                          >
                            {isSel && (
                              <span className="h-2 w-2 rounded-full bg-[#f56215]" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            {isSel && (
                              <span className="mb-1 inline-block rounded-full bg-[#f56215] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                Default
                              </span>
                            )}
                            <span className="block text-sm text-[#111] pr-14">
                              {addr.address}
                            </span>
                            {addr.receiverName && (
                              <span className="block text-xs text-[#737373] mt-0.5">
                                Deliver to: {addr.receiverName}
                              </span>
                            )}
                            {!serviceable && (
                              <span className="mt-1 flex items-center gap-1 text-xs text-red-600">
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                Outside our 10 km delivery area
                              </span>
                            )}
                          </span>
                        </div>
                        {/* Edit — sits above the select overlay */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAddress(addr);
                            setShowLocationSelector(true);
                          }}
                          className="absolute right-2 top-2 z-[3] inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-[#f56215] hover:bg-[#f56215]/10"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-[#737373] mt-1.5">
                  Set where you&rsquo;d like your meals delivered
                </p>
              )}

              {/* Up to 2 addresses per user — hide the add option once full. */}
              {addresses.length < 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAddress(null);
                    setShowLocationSelector(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#f56215]"
                >
                  <Plus className="h-3.5 w-3.5" />{" "}
                  {addresses.length > 0
                    ? "Add another address"
                    : "Set location"}
                </button>
              )}
            </div>

            {/* Daily delivery time — curated lunch / snacks / dinner slots */}
            <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
              <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-2">
                <Clock className="h-4 w-4 text-[#f56215]" /> Daily delivery time
              </label>
              <DeliveryTimePicker
                value={deliveryTime}
                onChange={setDeliveryTime}
              />
            </div>

            {/* Order summary — professional line items, bottom-most section */}
            <div className="bg-white rounded-2xl p-4 shadow-sm ring-1 ring-black/5">
              <p className="flex items-center gap-1.5 font-semibold text-[#111] mb-3">
                <ReceiptText className="h-4 w-4 text-[#f56215]" /> Order summary
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-[#555]">
                  <span>
                    {MEALS_PER_PLAN} meals × {rupees(totals.listPer)}
                  </span>
                  <span className="tabular-nums">
                    {rupees(totals.listSubtotal)}
                  </span>
                </div>
                {totals.discount > 0 && (
                  <div className="flex items-center justify-between text-[#1a7f37]">
                    <span>
                      Discount
                      {totals.discountPercent > 0
                        ? ` (${Math.round(totals.discountPercent)}%)`
                        : ""}
                    </span>
                    <span className="tabular-nums">
                      −{rupees(totals.discount)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-[#555]">
                  <span>GST (5%)</span>
                  <span className="tabular-nums">{rupees(totals.tax)}</span>
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t border-gray-100 pt-3">
                <span className="font-semibold text-[#111]">Total Amount</span>
                <span className="text-lg font-bold text-[#111] tabular-nums">
                  {rupees(totals.total)}
                </span>
              </div>
              <p className="mt-3 rounded-lg bg-[#f6f7f8] px-3 py-2 text-xs text-[#737373]">
                You&rsquo;ll pick your meals after checkout - 7 credits, any 7
                days in the next 30.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Diet step: a big, always-reachable call-us CTA at the bottom */}
      {step === "diet" && selectedBracket && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-100 px-4 pt-3 pb-4">
          <p className="text-center text-xs text-[#737373] mb-2">
            Questions or need help before subscribing?
          </p>
          <a
            href="tel:+919759399537"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#f56215] py-4 text-base font-semibold text-white active:bg-[#e05610]"
          >
            <Phone className="h-5 w-5" />
            Call us
          </a>
        </div>
      )}

      {step === "browse" && totals && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-100 p-4">
          {(() => {
            const missing: string[] = [];
            if (!selectedAddress) missing.push("delivery address");
            if (!deliveryTime) missing.push("delivery time");
            const unserviceable =
              !!selectedAddress && addressServiceable === false;
            const disabled = placing || missing.length > 0 || unserviceable;
            const hint = unserviceable
              ? "This address is outside our delivery area"
              : missing.length > 0
              ? `Add ${missing.join(" and ")} to continue`
              : null;
            return (
              <>
                {hint && (
                  <p
                    className={`mb-2 text-center text-xs ${
                      unserviceable ? "text-red-500" : "text-[#737373]"
                    }`}
                  >
                    {hint}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={disabled}
                  className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {placing
                    ? "Starting your plan…"
                    : `Buy Subscription - ${rupees(totals.total)}`}
                </button>
              </>
            );
          })()}
        </div>
      )}

      <SelectAddressSheet
        open={showSelectAddress && !showLocationSelector}
        onClose={() => {
          setShowSelectAddress(false);
          setEditingAddress(null);
        }}
        addresses={addresses}
        selectedAddress={selectedAddress}
        onSelect={(addr) => {
          setPickedAddress(addr);
          setShowSelectAddress(false);
        }}
        onAddNew={() => {
          setEditingAddress(null);
          setShowSelectAddress(false);
          setShowLocationSelector(true);
        }}
        onEdit={(addr) => {
          setEditingAddress(addr);
          setShowSelectAddress(false);
          setShowLocationSelector(true);
        }}
        floatingClose
      />
      <LocationSelector
        open={showLocationSelector}
        onClose={() => {
          setShowLocationSelector(false);
          setEditingAddress(null);
        }}
        editAddress={editingAddress}
        onSaved={handleAddressSaved}
        floatingClose
        enforceServiceArea
        receiverOverride={sharedReceiver}
      />

      {detailItem && (
        <IngredientsSheet
          open
          onClose={() => setDetailItem(null)}
          product={toProduct(detailItem)}
          floatingClose
        />
      )}
    </main>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto flex items-center justify-center">
          <p className="text-gray-500">Loading…</p>
        </main>
      }
    >
      <PurchaseWizard />
    </Suspense>
  );
}
