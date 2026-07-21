"use client";

import { useEffect, useState } from "react";
import { message } from "antd";
import type { Society } from "@/lib/societies";

export const SUPPORT_PHONE = "+91-7042816413";

export type DeliveryDetails =
  | { orderType: "dine-in"; name: string; phone: string }
  | {
      orderType: "delivery";
      name: string;
      phone: string;
      tower: string;
      floor: string;
      room: string;
    };

interface DeliveryDetailsSheetProps {
  open: boolean;
  onClose: () => void;
  /** The society being delivered to — drives the banner label and towers. */
  society: Society;
  /** Pre-fill the delivery name/phone (e.g. from the logged-in user). */
  defaultName?: string;
  defaultPhone?: string;
  /** Pre-fill the delivery location (e.g. from the last saved order). */
  defaultTower?: string;
  defaultFloor?: string;
  defaultRoom?: string;
  /** Shows a busy state on the CTA while the order is being placed. */
  submitting?: boolean;
  /** When false, delivery is turned off by admin — only dine-in is allowed. */
  deliveryAvailable?: boolean;
  onConfirm: (details: DeliveryDetails) => void;
}

type OrderType = "dine-in" | "delivery";

const SparkleIcon = () => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#f56215] to-[#ff9a4d]">
    <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.9 5.6L19.5 9l-4.6 3.3L16.4 18 12 14.7 7.6 18l1.5-5.7L4.5 9l5.6-1.4L12 2z" />
    </svg>
  </span>
);

export default function DeliveryDetailsSheet({
  open,
  onClose,
  society,
  defaultName = "",
  defaultPhone = "",
  defaultTower = "",
  defaultFloor = "",
  defaultRoom = "",
  submitting = false,
  deliveryAvailable = true,
  onConfirm,
}: DeliveryDetailsSheetProps) {
  // State initialises fresh on each mount; the parent mounts this sheet only
  // while open, so re-opening always starts from the pre-filled defaults.
  // When delivery is disabled by admin, fall back to dine-in.
  const [orderType, setOrderType] = useState<OrderType>(
    deliveryAvailable ? "delivery" : "dine-in",
  );
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [tower, setTower] = useState<string | null>(
    defaultTower && society.towers.includes(defaultTower) ? defaultTower : null,
  );
  const [floor, setFloor] = useState(defaultFloor);
  const [room, setRoom] = useState(defaultRoom);

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const phoneDigits = phone.replace(/\D/g, "");
  const validPhone = phoneDigits.length === 10;
  // Offices (e.g. Zomato) deliver to a tower/floor only — no room number.
  const collectRoom = society.collectRoom;
  const canSubmit =
    orderType === "dine-in"
      ? name.trim().length > 0 && validPhone
      : name.trim().length > 0 &&
        validPhone &&
        !!tower &&
        floor.trim().length > 0 &&
        (!collectRoom || room.trim().length > 0);

  const handleConfirm = () => {
    if (submitting || !canSubmit) return;
    if (orderType === "dine-in") {
      onConfirm({
        orderType: "dine-in",
        name: name.trim(),
        phone: phoneDigits,
      });
    } else {
      onConfirm({
        orderType: "delivery",
        name: name.trim(),
        phone: phoneDigits,
        tower: tower!,
        floor: floor.trim(),
        room: collectRoom ? room.trim() : "",
      });
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[230] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-[231] mx-auto max-w-[430px] animate-slide-up overflow-y-auto rounded-t-[28px] bg-[#faf7f2] shadow-[0_-4px_24px_rgba(0,0,0,0.12)] max-h-[90dvh]"
        role="dialog"
        aria-modal="true"
        aria-label="Delivery details"
      >
        <div className="mx-auto mt-3 h-1 w-12 shrink-0 rounded-full bg-[#e0d9cf]" />

        <div className="px-5 pt-3 pb-5">
          {/* Header */}
          <div className="mb-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#111] shadow-sm"
            >
              <svg
                className="h-5 w-5"
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
            </button>
            <div>
              <h2 className="text-[22px] font-extrabold leading-tight text-[#1c1c1c]">
                Delivery details
              </h2>
              <p className="text-[13px] text-[#8a8378]">
                How would you like to receive your order?
              </p>
            </div>
          </div>

          {/* Order type toggle */}
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8a8378]">
            Order Type
          </p>
          <div className="mb-4 flex gap-2 rounded-2xl bg-[#efe9e0] p-1.5">
            <button
              type="button"
              onClick={() => setOrderType("dine-in")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold transition-colors ${
                orderType === "dine-in"
                  ? "bg-white text-[#1c1c1c] shadow-sm"
                  : "text-[#8a8378]"
              }`}
            >
              <svg
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3v7a2 2 0 002 2h0a2 2 0 002-2V3M5 12v9M16 3c-1.5 0-3 1.8-3 5s1.5 4 3 4m0-9v18"
                />
              </svg>
              Dine-in
            </button>
            <button
              type="button"
              aria-disabled={!deliveryAvailable}
              onClick={() => {
                if (!deliveryAvailable) {
                  message.info(
                    "Delivery is currently unavailable. Please continue with Dine-in.",
                  );
                  return;
                }
                setOrderType("delivery");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold transition-colors ${
                !deliveryAvailable
                  ? "cursor-not-allowed text-[#bcb6ab] opacity-60"
                  : orderType === "delivery"
                    ? "bg-white text-[#1c1c1c] shadow-sm"
                    : "text-[#8a8378]"
              }`}
            >
              <svg
                className="h-[18px] w-[18px]"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <circle cx="5.5" cy="17.5" r="3" />
                <circle cx="18.5" cy="17.5" r="3" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.5 17.5l3.5-8h5l3 8M9 9.5h6M14 6h3"
                />
              </svg>
              Delivery
            </button>
          </div>

          {!deliveryAvailable && (
            <p className="mb-4 -mt-2 text-[12px] font-medium text-[#c0492b]">
              Delivery is unavailable right now — only Dine-in orders can be
              placed.
            </p>
          )}

          {/* Info banner */}
          <div className="mb-5 flex items-start gap-3 rounded-2xl bg-[#fdeada] px-4 py-3.5">
            <SparkleIcon />
            {orderType === "delivery" ? (
              <p className="text-[14px] leading-[20px] text-[#5c5346]">
                Delivery is{" "}
                <span className="font-semibold text-[#f56215]">
                  only available at {society.label}
                </span>
                . For any clarification, call{" "}
                <a
                  href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
                  className="font-semibold text-[#f56215] underline"
                >
                  {SUPPORT_PHONE}
                </a>
              </p>
            ) : (
              <p className="text-[14px] leading-[20px] text-[#5c5346]">
                Please pick up your order from the shop within{" "}
                <span className="font-semibold text-[#f56215]">30 minutes</span>
                , or call{" "}
                <a
                  href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
                  className="font-semibold text-[#f56215] underline"
                >
                  {SUPPORT_PHONE}
                </a>{" "}
                to confirm the status of your order.
              </p>
            )}
          </div>

          {/* Name + phone — required for both dine-in and delivery */}
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8a8378]">
            Your Details
          </p>
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mb-3 w-full rounded-2xl border border-[#e7e0d6] bg-white px-4 py-3.5 text-[15px] text-[#111] placeholder:text-[#a3a3a3] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#f56215]"
          />
          <input
            type="tel"
            inputMode="numeric"
            maxLength={10}
            placeholder="Phone number"
            value={phone}
            onChange={(e) =>
              setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            className={`w-full rounded-2xl border bg-white px-4 py-3.5 text-[15px] text-[#111] placeholder:text-[#a3a3a3] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#f56215] ${
              phone.length > 0 && !validPhone
                ? "border-red-400"
                : "border-[#e7e0d6]"
            }`}
          />
          {phone.length > 0 && !validPhone && (
            <p className="mt-1 text-[12px] text-red-500">
              Phone number must be exactly 10 digits
            </p>
          )}
          <p className="mb-5 mt-1.5 text-[12px] text-[#a39c90]">
            We&apos;ll save your details so you don&apos;t have to enter them
            next time.
          </p>

          {/* Delivery-only fields */}
          {orderType === "delivery" && (
            <>
              <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-wide text-[#8a8378]">
                Select Your Tower
              </p>
              <div className="mb-5 grid grid-cols-4 gap-3">
                {society.towers.map((t) => {
                  const selected = tower === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTower(t)}
                      className={`rounded-2xl border py-4 text-[18px] font-bold transition-colors ${
                        selected
                          ? "border-[#f56215] bg-[#f56215] text-white"
                          : "border-[#e7e0d6] bg-white text-[#1c1c1c]"
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>

              <div
                className={`mb-2 grid gap-3 ${
                  collectRoom ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Floor"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  className="w-full rounded-2xl border border-[#e7e0d6] bg-white px-4 py-3.5 text-[15px] text-[#111] placeholder:text-[#a3a3a3] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#f56215]"
                />
                {collectRoom && (
                  <input
                    type="text"
                    placeholder="Room number"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="w-full rounded-2xl border border-[#e7e0d6] bg-white px-4 py-3.5 text-[15px] text-[#111] placeholder:text-[#a3a3a3] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#f56215]"
                  />
                )}
              </div>
            </>
          )}

          {/* CTA */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit || submitting}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#f56215] py-4 text-[16px] font-semibold text-white shadow-[0_8px_20px_rgba(245,98,21,0.3)] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? "Processing…"
              : orderType === "delivery"
                ? "Save Address & Pay"
                : "Proceed to Payment"}
            {!submitting && (
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14M13 6l6 6-6 6"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
