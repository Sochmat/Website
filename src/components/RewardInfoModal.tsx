"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface RewardInfoModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * The ladder in force for the customer's delivery location — earn percentages
   * by order day. Configured per location in admin, so it is passed in rather
   * than imported as a constant.
   */
  rates: number[];
  /** The customer's current earn rate, highlighted in the ladder if given. */
  currentRate?: number;
}

/** The worked example's figures. Kept round so the arithmetic is followable. */
const EXAMPLE_SUBTOTAL = 500;
const EXAMPLE_DISCOUNT = 50;
const EXAMPLE_BASE = EXAMPLE_SUBTOTAL - EXAMPLE_DISCOUNT;

/**
 * Explains how a reward-point figure is arrived at: the streak sets the rate,
 * the rate applies to the pre-tax total, points then spend like rupees.
 *
 * The three steps are numbered because they genuinely are a sequence — each one
 * feeds the next — not for decoration. A bottom sheet rather than a centred
 * dialog, matching the app's other mobile sheets and keeping the close control
 * in thumb reach.
 */
export default function RewardInfoModal({
  open,
  onClose,
  rates,
  currentRate,
}: RewardInfoModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const exampleRate = currentRate ?? rates[0];
  const examplePoints = Math.round((EXAMPLE_BASE * exampleRate) / 100);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reward-info-title"
      onClick={onClose}
    >
      <div
        className="animate-slide-up max-h-[88vh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-[#f0e6de] bg-white px-5 pt-5 pb-3">
          <div>
            <h2
              id="reward-info-title"
              className="font-squada text-2xl leading-none tracking-wide text-[#1c1c1c] uppercase"
            >
              How your points add up
            </h2>
            <p className="mt-1 text-xs text-[#8a6b57]">
              The more days you order in a month, the higher your rate.
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-1 shrink-0 rounded-full p-2 text-[#8a6b57] transition-colors hover:bg-[#fff4ec]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-6">
          <ol className="space-y-6">
            {/* 1 — the rate */}
            <li>
              <div className="flex items-baseline gap-2">
                <span className="font-play text-xs text-[#f56215]">1</span>
                <h3 className="text-sm font-semibold text-[#1c1c1c]">
                  Your order days set the rate
                </h3>
              </div>
              <div className="mt-3 flex gap-1.5">
                {rates.map((rate, index) => {
                  const isCurrent = currentRate === rate;
                  return (
                    <div
                      key={rate}
                      className={`flex-1 rounded-lg py-2 text-center ${
                        isCurrent ? "bg-[#f56215]" : "bg-[#fff4ec]"
                      }`}
                    >
                      <div
                        className={`font-play text-sm leading-none ${
                          isCurrent ? "text-white" : "text-[#f56215]"
                        }`}
                      >
                        {rate}%
                      </div>
                      <div
                        className={`mt-1 text-[9px] leading-none ${
                          isCurrent ? "text-white/80" : "text-[#c4a894]"
                        }`}
                      >
                        {index === rates.length - 1
                          ? `${index + 1}+ days`
                          : `${index + 1} day${index === 0 ? "" : "s"}`}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-[#8a6b57]">
                Your first order in a month earns {rates[0]}%. Every further day
                you order that month moves you up a rung, to a maximum of{" "}
                {rates[rates.length - 1]}%. The days don&apos;t have to be
                back-to-back.
              </p>
            </li>

            {/* 2 — the base */}
            <li>
              <div className="flex items-baseline gap-2">
                <span className="font-play text-xs text-[#f56215]">2</span>
                <h3 className="text-sm font-semibold text-[#1c1c1c]">
                  The rate applies to your pre-tax total
                </h3>
              </div>
              <div className="mt-3 rounded-xl bg-[#fafafa] px-4 py-3">
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-[#666]">Item total</dt>
                    <dd className="text-[#1c1c1c]">₹{EXAMPLE_SUBTOTAL}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-[#666]">Discounts</dt>
                    <dd className="text-[#00a86e]">−₹{EXAMPLE_DISCOUNT}</dd>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-[#e8e8e8] pt-2 font-semibold">
                    <dt className="text-[#1c1c1c]">Earns points</dt>
                    <dd className="text-[#1c1c1c]">₹{EXAMPLE_BASE}</dd>
                  </div>
                </dl>
                <p className="mt-3 border-t border-[#e8e8e8] pt-3 text-xs text-[#8a6b57]">
                  At {exampleRate}% that is{" "}
                  <span className="font-play text-[#f56215]">
                    {examplePoints} points
                  </span>
                  .
                </p>
              </div>
              <p className="mt-2 text-xs text-[#8a6b57]">
                GST and the delivery charge are not counted. Spending points
                doesn&apos;t reduce what an order earns.
              </p>
            </li>

            {/* 3 — spending */}
            <li>
              <div className="flex items-baseline gap-2">
                <span className="font-play text-xs text-[#f56215]">3</span>
                <h3 className="text-sm font-semibold text-[#1c1c1c]">
                  Points spend like rupees
                </h3>
              </div>
              <p className="mt-2 text-xs text-[#8a6b57]">
                1 point is ₹1. Use your whole balance on any later order — there
                is no minimum and nothing expires. Points come off after GST, so
                they never change the tax you pay, and at least ₹1 stays payable.
              </p>
            </li>
          </ol>

          <div className="mt-6 rounded-xl border border-[#ffe0cb] bg-[#fff8f3] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#1c1c1c]">
              How the month works
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs text-[#8a6b57]">
              <li className="flex gap-2">
                <span className="text-[#f56215]">•</span>
                One step per day. A second order the same day earns at the same
                rate.
              </li>
              <li className="flex gap-2">
                <span className="text-[#f56215]">•</span>
                Skipping days costs you nothing — your rate only ever goes up
                within a month.
              </li>
              <li className="flex gap-2">
                <span className="text-[#f56215]">•</span>
                Once you reach {rates[rates.length - 1]}%, it stays there for the rest
                of the month.
              </li>
              <li className="flex gap-2">
                <span className="text-[#f56215]">•</span>
                On the 1st everyone starts again at {rates[0]}%.
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-[#1c1c1c] py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#024731]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
