"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { message } from "antd";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import SelectAddressSheet from "@/components/SelectAddressSheet";
import AddAddressSheet from "@/components/AddAddressSheet";
import { handleRazorpayPayment } from "@/helpers/razorpay";
import {
  distanceFromBusinessKm,
  isWithinServiceArea,
} from "@/helpers/distance";
import { buildWeekDates, isEligible, GST_RATE } from "@/lib/subscription";
import { type UserAddress } from "@/lib/types";

interface BuilderItem {
  id: string;
  name: string;
  protein: number;
  kcal: number;
  isVeg: boolean;
  subscriptionPrice: number;
  isAvailableForSubscription: boolean;
  image: string;
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function DraggableItem({
  item,
  selected,
  onTap,
}: {
  item: BuilderItem;
  selected: boolean;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${item.id}`,
    data: { item },
  });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onTap}
      className={`text-left w-full bg-white rounded-xl p-3 shadow-sm border-2 ${
        selected ? "border-[#f56215]" : "border-transparent"
      } ${isDragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-3.5 h-3.5 border-2 shrink-0 flex items-center justify-center ${
            item.isVeg ? "border-green-600" : "border-red-600"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              item.isVeg ? "bg-green-600" : "bg-red-600"
            }`}
          />
        </span>
        <span className="font-medium text-sm text-[#111] truncate">
          {item.name}
        </span>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="bg-[rgba(0,153,64,0.1)] text-[#009940] text-[11px] font-semibold px-2 py-0.5 rounded-full">
          {item.protein}g protein
        </span>
        <span className="font-semibold text-sm text-[#111]">
          ₹{item.subscriptionPrice}
        </span>
      </div>
    </button>
  );
}

function DayCard({
  date,
  weekday,
  item,
  onClear,
  onTapPlace,
  tapArmed,
}: {
  date: string;
  weekday: string;
  item: BuilderItem | null;
  onClear: () => void;
  onTapPlace: () => void;
  tapArmed: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${date}`, data: { date } });
  const dayNum = date.slice(8, 10);
  return (
    <div
      ref={setNodeRef}
      onClick={tapArmed ? onTapPlace : undefined}
      className={`rounded-xl p-2.5 min-h-[92px] border-2 transition-colors ${
        isOver || (tapArmed && !item)
          ? "border-[#f56215] bg-[#fff5ef]"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#666]">
          {weekday.slice(0, 3)} {dayNum}
        </span>
        {item && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="text-gray-400 text-xs"
            aria-label="Clear day"
          >
            ✕
          </button>
        )}
      </div>
      {item ? (
        <div className="mt-1.5">
          <p className="text-xs font-medium text-[#111] leading-tight line-clamp-2">
            {item.name}
          </p>
          <p className="text-[10px] text-[#009940] font-semibold mt-1">
            {item.protein}g • ₹{item.subscriptionPrice}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-gray-400 text-center">
          {tapArmed ? "Tap to add" : "Drop item"}
        </p>
      )}
    </div>
  );
}

export default function SubscriptionBuilderPage() {
  const router = useRouter();
  const { user, isAuthenticated, setUser } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const { open: storeOpen, loading: storeLoading } = useStoreStatus();

  const [items, setItems] = useState<BuilderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(tomorrowISO());
  // date -> productId
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<BuilderItem | null>(null);

  const [deliveryTime, setDeliveryTime] = useState("08:00");
  const [pickedAddress, setPickedAddress] = useState<UserAddress | null>(null);
  const [showSelectAddress, setShowSelectAddress] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);
  const [placing, setPlacing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  useEffect(() => {
    if (!storeLoading && !storeOpen) {
      message.info("Store is currently closed");
      router.replace("/");
    }
  }, [storeLoading, storeOpen, router]);

  useEffect(() => {
    fetch("/api/menu")
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.items)) {
          const eligible = (data.items as BuilderItem[]).filter((i) =>
            isEligible(i),
          );
          setItems(eligible);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addresses = useMemo(
    () => (isAuthenticated ? user?.addresses ?? [] : []),
    [isAuthenticated, user?.addresses],
  );
  // Default to the first saved address until the user picks another.
  const selectedAddress = pickedAddress ?? addresses[0] ?? null;

  const week = useMemo(() => buildWeekDates(startDate), [startDate]);
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  // Changing the start date drops any assignment whose date left the window.
  const changeStartDate = useCallback((nextStart: string) => {
    setStartDate(nextStart);
    const valid = new Set(buildWeekDates(nextStart).map((w) => w.date));
    setAssignments((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([date]) => valid.has(date)),
      ),
    );
  }, []);

  const assign = useCallback((date: string, productId: string) => {
    setAssignments((prev) => ({ ...prev, [date]: productId }));
  }, []);

  const clearDay = useCallback((date: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
  }, []);

  const onDragStart = (e: DragStartEvent) => {
    const it = e.active.data.current?.item as BuilderItem | undefined;
    if (it) setActiveItem(it);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveItem(null);
    const it = e.active.data.current?.item as BuilderItem | undefined;
    const overDate = e.over?.data.current?.date as string | undefined;
    if (it && overDate) assign(overDate, it.id);
  };

  const totals = useMemo(() => {
    const chosen = Object.values(assignments)
      .map((pid) => itemsById.get(pid))
      .filter(Boolean) as BuilderItem[];
    const subtotal = chosen.reduce((s, i) => s + i.subscriptionPrice, 0);
    const protein = chosen.reduce((s, i) => s + i.protein, 0);
    const kcal = chosen.reduce((s, i) => s + i.kcal, 0);
    const tax = Math.round(subtotal * GST_RATE);
    return {
      count: chosen.length,
      subtotal,
      protein,
      kcal,
      tax,
      total: subtotal + tax,
    };
  }, [assignments, itemsById]);

  // Address save — mirrors the proven /subscribe handler.
  const handleSaveNewAddress = async (newAddr: UserAddress) => {
    const isEditing = editingAddress !== null;
    if (isAuthenticated && user?._id) {
      const updated = isEditing
        ? (user.addresses ?? []).map((a) =>
            a.id === editingAddress?.id ? newAddr : a,
          )
        : [...(user.addresses ?? []), newAddr];
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _id: user._id, addresses: updated }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        setUser(data.user);
        setPickedAddress(newAddr);
        message.success(isEditing ? "Address updated" : "Address saved");
      } else {
        message.error(data.message ?? "Failed to save address");
      }
    } else {
      setPickedAddress(newAddr);
      message.success("Address saved");
    }
    setShowAddAddress(false);
    setShowSelectAddress(false);
    setEditingAddress(null);
  };

  const addressServiceable = selectedAddress
    ? isWithinServiceArea(selectedAddress.lat, selectedAddress.long)
    : null;

  const handleSubscribe = async () => {
    if (totals.count === 0) {
      message.error("Add at least one day");
      return;
    }
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
      setShowAddAddress(true);
      return;
    }
    if (addressServiceable === false) {
      const dist = distanceFromBusinessKm(
        selectedAddress.lat,
        selectedAddress.long,
      );
      message.error(
        `Delivery not available here. You're ${dist.toFixed(1)} km away; we deliver within 10 km.`,
      );
      return;
    }

    setPlacing(true);
    try {
      const days = week
        .filter((w) => assignments[w.date])
        .map((w) => ({
          date: w.date,
          weekday: w.weekday,
          productId: assignments[w.date],
        }));

      const res = await fetch("/api/subscriptions/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStartDate: startDate,
          days,
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
        orderId: data.plan._id,
        onSuccess: async (response) => {
          await fetch("/api/subscriptions/plans", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              _id: data.plan._id,
              paymentId: response.razorpay_payment_id,
              paymentStatus: "paid",
            }),
          });
          router.push(`/subscription/success?planId=${data.plan._id}`);
        },
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

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto flex items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </main>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-40">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-100 px-4 py-3">
          <h1 className="text-lg font-bold text-[#111]">Build your week</h1>
          <p className="text-xs text-gray-500">
            {selectedItemId
              ? "Tap a day to place the selected item"
              : "Drag an item onto a day — or tap it, then tap a day"}
          </p>
        </header>

        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <label className="block text-xs text-gray-500 mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              min={tomorrowISO()}
              onChange={(e) => changeStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <label className="block text-xs text-gray-500 mt-3 mb-1">
              Daily delivery time
            </label>
            <input
              type="time"
              value={deliveryTime}
              onChange={(e) => setDeliveryTime(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {week.map((w) => (
              <DayCard
                key={w.date}
                date={w.date}
                weekday={w.weekday}
                item={assignments[w.date] ? itemsById.get(assignments[w.date]) ?? null : null}
                onClear={() => clearDay(w.date)}
                tapArmed={!!selectedItemId}
                onTapPlace={() => {
                  if (selectedItemId) {
                    assign(w.date, selectedItemId);
                    setSelectedItemId(null);
                  }
                }}
              />
            ))}
          </div>

          <div>
            <h2 className="font-semibold text-[#111] mb-2">Choose items</h2>
            {items.length === 0 ? (
              <p className="text-sm text-gray-500">
                No subscription items available yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {items.map((it) => (
                  <DraggableItem
                    key={it.id}
                    item={it}
                    selected={selectedItemId === it.id}
                    onTap={() =>
                      setSelectedItemId((cur) => (cur === it.id ? null : it.id))
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-[#111]">Delivery address</p>
                {selectedAddress ? (
                  <>
                    <p className="text-sm text-[#111] mt-1">
                      {selectedAddress.address}
                    </p>
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
                onClick={() => setShowSelectAddress(true)}
                className="text-[#f56215] font-semibold text-sm underline"
              >
                {selectedAddress ? "Change" : "Add"}
              </button>
            </div>
          </div>
        </div>

        {/* Sticky summary + CTA */}
        <div className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white border-t border-gray-100 p-4">
          <div className="flex items-center justify-between text-xs text-[#666] mb-2">
            <span>{totals.count} days</span>
            <span className="font-semibold text-[#009940]">
              {totals.protein}g protein · {totals.kcal} kcal
            </span>
          </div>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={placing || totals.count === 0}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl disabled:opacity-60"
          >
            {placing
              ? "Placing…"
              : totals.count === 0
                ? "Add days to continue"
                : `Subscribe · ₹${totals.total}`}
          </button>
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
            setPickedAddress(addr);
            setShowSelectAddress(false);
          }}
          onAddNew={() => {
            setEditingAddress(null);
            setShowSelectAddress(false);
            setShowAddAddress(true);
          }}
          onEdit={(addr) => {
            setEditingAddress(addr);
            setShowSelectAddress(false);
            setShowAddAddress(true);
          }}
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

        <DragOverlay>
          {activeItem ? (
            <div className="bg-white rounded-xl p-3 shadow-lg border-2 border-[#f56215]">
              <span className="font-medium text-sm text-[#111]">
                {activeItem.name}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </main>
    </DndContext>
  );
}
