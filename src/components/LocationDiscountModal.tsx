"use client";

import { useEffect, useRef, useState } from "react";
import { useLocation } from "@/context/LocationContext";
import { useCart } from "@/context/CartContext";
import { computeSocietyDiscount } from "@/lib/societyDiscounts";

/** sessionStorage key prefix — show the perk once per session per society. */
const SEEN_PREFIX = "sochmat_location_discount_seen_";

/**
 * A celebratory "location perk" coupon shown on the cart/checkout page when the
 * selected society has an active flat discount. The percentage counts up inside
 * a perforated ticket that springs in — one signature moment, everything else
 * kept quiet. Appears once per session per society and respects reduced motion.
 */
export default function LocationDiscountModal() {
  const { society, societyDiscountPercent } = useLocation();
  const { totalPrice, totalItems } = useCart();
  const [open, setOpen] = useState(false);
  // The percentage value shown, animated up from 0.
  const [shown, setShown] = useState(0);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const savings = computeSocietyDiscount(totalPrice, societyDiscountPercent);

  // Open once per session when a discount is live and the cart has items.
  useEffect(() => {
    if (societyDiscountPercent <= 0 || totalItems <= 0) return;
    if (typeof window === "undefined") return;
    const key = `${SEEN_PREFIX}${society.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable — still show it once this mount.
    }
    setOpen(true);
  }, [societyDiscountPercent, totalItems, society.id]);

  // Count the percentage up when the modal opens (skipped for reduced motion).
  useEffect(() => {
    if (!open) return;
    const target = societyDiscountPercent;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(target);
      return;
    }
    setShown(0);
    const duration = 900;
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, societyDiscountPercent]);

  // Focus the dismiss button and wire Escape-to-close.
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ldm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ldm-title"
      onClick={() => setOpen(false)}
    >
      <div className="ldm-card" onClick={(e) => e.stopPropagation()}>
        {/* Coupon head — the signature count-up */}
        <div className="ldm-head">
          <span className="ldm-glow" aria-hidden />
          <div className="ldm-percent">
            <span className="ldm-num">{shown}</span>
            <span className="ldm-pct">%</span>
            <span className="ldm-off">OFF</span>
          </div>
          <span className="ldm-shimmer" aria-hidden />
        </div>

        {/* Perforation with punched notches */}
        <div className="ldm-perf">
          <span className="ldm-notch ldm-notch-l" aria-hidden />
          <span className="ldm-notch ldm-notch-r" aria-hidden />
        </div>

        {/* Details */}
        <div className="ldm-body">
          <p className="ldm-eyebrow">Location perk unlocked</p>
          <h2 id="ldm-title" className="ldm-heading">
            {societyDiscountPercent}% off at {society.name}
          </h2>
          {savings > 0 && (
            <p className="ldm-savings">
              You save <strong>₹{savings}</strong> on this order.
            </p>
          )}
          <p className="ldm-note">Applied automatically at checkout.</p>
          <button
            ref={closeBtnRef}
            type="button"
            className="ldm-cta"
            onClick={() => setOpen(false)}
          >
            Sweet, let&rsquo;s order
          </button>
        </div>
      </div>

      <style jsx>{`
        .ldm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(20, 16, 14, 0.55);
          backdrop-filter: blur(4px);
          animation: ldm-fade 0.25s ease both;
        }
        .ldm-card {
          position: relative;
          width: 100%;
          max-width: 340px;
          background: #ffffff;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
          animation: ldm-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .ldm-head {
          position: relative;
          height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: linear-gradient(135deg, #ff7a33 0%, #f56215 55%, #e0490a 100%);
        }
        .ldm-glow {
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(255, 255, 255, 0.55) 0%,
            rgba(255, 255, 255, 0) 65%
          );
          animation: ldm-pulse 2.4s ease-in-out infinite;
        }
        .ldm-percent {
          position: relative;
          display: flex;
          align-items: baseline;
          gap: 2px;
          color: #fff;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
        }
        .ldm-num {
          font-size: 76px;
          font-weight: 800;
          line-height: 1;
          letter-spacing: -3px;
          font-variant-numeric: tabular-nums;
        }
        .ldm-pct {
          font-size: 34px;
          font-weight: 700;
          line-height: 1;
        }
        .ldm-off {
          align-self: flex-start;
          margin-left: 8px;
          margin-top: 6px;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 2px;
          padding: 3px 7px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.22);
          color: #fff;
        }
        .ldm-shimmer {
          position: absolute;
          top: 0;
          left: -60%;
          width: 45%;
          height: 100%;
          background: linear-gradient(
            100deg,
            transparent 0%,
            rgba(255, 255, 255, 0.35) 50%,
            transparent 100%
          );
          transform: skewX(-18deg);
          animation: ldm-sweep 1.1s ease-out 0.35s both;
        }
        .ldm-perf {
          position: relative;
          height: 0;
          border-top: 2px dashed #e7e2dc;
        }
        .ldm-notch {
          position: absolute;
          top: -11px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(20, 16, 14, 0.55);
        }
        .ldm-notch-l {
          left: -11px;
        }
        .ldm-notch-r {
          right: -11px;
        }
        .ldm-body {
          padding: 22px 24px 24px;
          text-align: center;
        }
        .ldm-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #f56215;
          margin: 0 0 6px;
        }
        .ldm-heading {
          font-size: 20px;
          font-weight: 700;
          color: #1c1c1c;
          margin: 0 0 10px;
          line-height: 1.25;
        }
        .ldm-savings {
          font-size: 15px;
          color: #444;
          margin: 0 0 4px;
        }
        .ldm-savings strong {
          color: #00a86e;
          font-weight: 800;
        }
        .ldm-note {
          font-size: 12px;
          color: #9a9a9a;
          margin: 0 0 18px;
        }
        .ldm-cta {
          width: 100%;
          padding: 13px;
          border: none;
          border-radius: 14px;
          background: #f56215;
          color: #fff;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 8px 20px rgba(245, 98, 21, 0.3);
          transition: transform 0.12s ease, box-shadow 0.12s ease;
        }
        .ldm-cta:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(245, 98, 21, 0.38);
        }
        .ldm-cta:active {
          transform: translateY(0);
        }
        @keyframes ldm-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes ldm-pop {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes ldm-pulse {
          0%,
          100% {
            transform: scale(0.85);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.1);
            opacity: 1;
          }
        }
        @keyframes ldm-sweep {
          from {
            left: -60%;
          }
          to {
            left: 130%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .ldm-backdrop,
          .ldm-card {
            animation-duration: 0.001s;
          }
          .ldm-glow,
          .ldm-shimmer {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
