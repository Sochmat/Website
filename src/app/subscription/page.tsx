"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { message } from "antd";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import SelectAddressSheet from "@/components/SelectAddressSheet";
import LocationSelector from "@/components/LocationSelector";
import LocationPrompt from "@/components/LocationPrompt";
import { handleRazorpayPayment } from "@/helpers/razorpay";
import { distanceFromBusinessKm, isWithinServiceArea } from "@/helpers/distance";
import { GST_RATE } from "@/lib/subscription";
import { MEALS_PER_PLAN } from "@/lib/subscriptionBrackets";
import { isBracketKey, isDiet } from "@/lib/subscriptionBrackets";
import type { ProteinBracketKey, SubscriptionDiet, UserAddress } from "@/lib/types";
import BracketCard from "@/components/subscription/BracketCard";
import DietCard from "@/components/subscription/DietCard";
import SubscriptionItemCard from "@/components/subscription/SubscriptionItemCard";
import { rupees, type BracketOption, type SubscriptionItem } from "@/components/subscription/types";

function priceForDiet(b: BracketOption, diet: SubscriptionDiet) {
  return diet === "veg-nonveg" ? b.nonVegPrice : b.vegPrice;
}

function PurchaseWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, isAuthenticated } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const { open: storeOpen, loading: storeLoading } = useStoreStatus();

  // The wizard step lives in the URL, so browser Back works and — critically —
  // the login-popup round-trip can't wipe the customer's choices.
  const bracketKey = params.get("bracket");
  const dietParam = params.get("diet");
  const bracket: ProteinBracketKey | null = isBracketKey(bracketKey) ? bracketKey : null;
  const diet: SubscriptionDiet | null = isDiet(dietParam) ? dietParam : null;
  const step: "bracket" | "diet" | "browse" = !bracket ? "bracket" : !diet ? "diet" : "browse";

  const [brackets, setBrackets] = useState<BracketOption[]>([]);
  const [items, setItems] = useState<SubscriptionItem[]>([]);
  // null = not fetched for the current bracket+diet yet.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const [deliveryTime, setDeliveryTime] = useState("08:00");
  const [pickedAddress, setPickedAddress] = useState<UserAddress | null>(null);
  const [showSelectAddress, setShowSelectAddress] = useState(false);
  // The full-screen Google-map picker (search + drag pin + GPS), used for both
  // adding and editing. It embeds AddAddressSheet for the flat/receiver details.
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!storeLoading && !storeOpen) {
      message.info("Store is currently closed");
      router.replace("/");
    }
  }, [storeLoading, storeOpen, router]);

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

  const itemsLoading = !!bracket && !!diet && loadedFor !== `${bracket}|${diet}`;

  const selectedBracket = useMemo(
    () => brackets.find((b) => b.key === bracket) ?? null,
    [brackets, bracket],
  );

  const totals = useMemo(() => {
    if (!selectedBracket || !diet) return null;
    const per = priceForDiet(selectedBracket, diet);
    const subtotal = per * MEALS_PER_PLAN;
    const tax = Math.round(subtotal * GST_RATE);
    return { per, subtotal, tax, total: subtotal + tax };
  }, [selectedBracket, diet]);

  const addresses = useMemo(
    () => (isAuthenticated ? user?.addresses ?? [] : []),
    [isAuthenticated, user?.addresses],
  );
  const selectedAddress = pickedAddress ?? addresses[0] ?? null;
  const addressServiceable = selectedAddress
    ? isWithinServiceArea(selectedAddress.lat, selectedAddress.long)
    : null;

  const go = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.push(`/subscription?${sp.toString()}`);
  };

  // The map picker's embedded AddAddressSheet has already persisted the address
  // (PATCH /api/users + UserContext.setUser for signed-in users, or localStorage
  // for guests). Here we just adopt it as the plan's delivery address.
  const handleAddressSaved = (addr: UserAddress) => {
    setPickedAddress(addr);
    setShowLocationSelector(false);
    setShowSelectAddress(false);
    setEditingAddress(null);
  };

  const handleBuy = async () => {
    if (!bracket || !diet || !totals) return;
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
      message.error("Please enter receiver name and phone");
      setEditingAddress(selectedAddress);
      setShowLocationSelector(true);
      return;
    }
    if (addressServiceable === false) {
      const dist = distanceFromBusinessKm(selectedAddress.lat, selectedAddress.long);
      message.error(
        `Delivery not available here. You're ${dist.toFixed(1)} km away; we deliver within 10 km.`,
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
            name: selectedAddress.receiverName,
            phone: selectedAddress.receiverPhone,
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
          name: selectedAddress.receiverName ?? "",
          email: "",
          contact: selectedAddress.receiverPhone ?? "",
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

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-40">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
        {step !== "bracket" && (
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm text-[#f56215] font-semibold mb-1"
          >
            ← Back
          </button>
        )}
        <h1 className="text-lg font-bold text-[#111]">
          {step === "bracket"
            ? "Choose your protein bracket"
            : step === "diet"
              ? "Veg or Veg + Non-veg?"
              : "Your bracket menu"}
        </h1>
        <p className="text-xs text-gray-500">7 meals · schedule any 7 days in the next 30</p>
      </header>

      <div className="p-4 space-y-3">
        {step === "bracket" &&
          brackets.map((b) => (
            <BracketCard key={b.key} bracket={b} onSelect={() => go({ bracket: b.key })} />
          ))}

        {step === "diet" && selectedBracket && (
          <>
            {(["veg", "veg-nonveg"] as SubscriptionDiet[]).map((d) => (
              <DietCard
                key={d}
                diet={d}
                pricePerMeal={priceForDiet(selectedBracket, d)}
                onSelect={() => go({ diet: d })}
              />
            ))}
            <p className="text-center text-xs text-[#737373] pt-2">
              7 meals + 5% GST, billed once. You pick the meals after checkout.
            </p>
          </>
        )}

        {step === "browse" && totals && (
          <>
            {/* Contextual GPS-permission prompt: pre-positions the address map
                pin at the customer's real location. Shows once per browser. */}
            <LocationPrompt />
            <div className="bg-white rounded-2xl p-4 shadow-sm text-sm">
              <p className="font-semibold text-[#111]">
                {rupees(totals.per)} × {MEALS_PER_PLAN} = {rupees(totals.subtotal)}
              </p>
              <p className="text-[#737373] text-xs mt-0.5">
                + {rupees(totals.tax)} GST ={" "}
                <span className="font-semibold text-[#111]">{rupees(totals.total)}</span>
              </p>
              <p className="text-xs text-[#737373] mt-2">
                You&rsquo;ll pick your meals after checkout — 7 credits, any 7 days in the next 30.
              </p>
            </div>

            <div>
              <h2 className="font-semibold text-[#111] mb-2">Meals in this plan</h2>
              {itemsLoading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-gray-500">No meals available yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {items.map((it) => (
                    <SubscriptionItemCard key={it.id} item={it} />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <label className="block text-xs text-gray-500 mb-1">Daily delivery time</label>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
              />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-[#111]">Delivery address</p>
                  {selectedAddress ? (
                    <>
                      <p className="text-sm text-[#111] mt-1">{selectedAddress.address}</p>
                      {selectedAddress.receiverName && (
                        <p className="text-xs text-[#737373] mt-0.5">
                          Deliver to: {selectedAddress.receiverName}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-[#737373] mt-1">Add delivery address</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // With saved addresses, pick from them first; otherwise jump
                    // straight into the map picker.
                    if (addresses.length > 0) {
                      setShowSelectAddress(true);
                    } else {
                      setEditingAddress(null);
                      setShowLocationSelector(true);
                    }
                  }}
                  className="text-[#f56215] font-semibold text-sm underline"
                >
                  {selectedAddress ? "Change" : "Add"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {step === "browse" && totals && (
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={handleBuy}
            disabled={placing}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl disabled:opacity-60"
          >
            {placing ? "Placing…" : `Buy ${MEALS_PER_PLAN} meals · ${rupees(totals.total)}`}
          </button>
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
      />
      <LocationSelector
        open={showLocationSelector}
        onClose={() => {
          setShowLocationSelector(false);
          setEditingAddress(null);
        }}
        editAddress={editingAddress}
        onSaved={handleAddressSaved}
      />
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
