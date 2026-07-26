"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { POINT_RATES } from "@/lib/rewards";
import { useRewardSummary } from "@/lib/useRewardSummary";
import RewardInfoModal from "@/components/RewardInfoModal";

/**
 * The customer's reward streak as a rung-by-rung timeline.
 *
 * The rungs are a real sequence — day order decides what an order earns — so
 * the timeline is load-bearing rather than decorative. A flame travels the rail
 * on mount and settles on the last banked day; the rail's gradient runs orange
 * into lime, so the lime only appears once the customer is near the 20% cap.
 *
 * Signed-in only: a streak is personal, and a signed-out visitor has no number
 * to show. All the animation collapses to its final state under
 * prefers-reduced-motion, because every animated property's resting value is
 * set inline and the keyframes only supply the `from`.
 */
export default function StreakTimeline() {
  const summary = useRewardSummary();
  const [showInfo, setShowInfo] = useState(false);
  if (!summary) return null;

  const { streak, nextStreak, nextRate, points } = summary;
  const rungs = POINT_RATES.length;
  /** Days banked, clamped to the ladder. */
  const reached = Math.max(0, Math.min(streak, rungs));
  /** Percent of the rail (measured dot-centre to dot-centre) that is filled. */
  const fill = reached > 1 ? ((reached - 1) / (rungs - 1)) * 100 : 0;
  const atCap = reached >= rungs;
  /** Ordering today advances the streak — ghost the rung it would reach. */
  const advances = nextStreak > streak;
  const ghost = advances ? Math.min(nextStreak, rungs) : null;

  const title = reached === 0 ? "Start your streak" : `Day ${reached} streak`;
  const detail = !advances
    ? `Today is banked — you're earning ${nextRate}% back.`
    : atCap
      ? "You're at 20% back — the maximum."
      : reached === 0
        ? "Your first order earns 10% back."
        : `Order today to reach ${nextRate}%.`;

  return (
    <section
      className="mx-4 mt-4 rounded-2xl border border-[#ffe0cb] bg-[#fff8f3] px-4 pt-4 pb-3"
      aria-label="Your reward streak"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-squada text-2xl leading-none tracking-wide text-[#1c1c1c] uppercase">
            {title}
          </h2>
          <p className="mt-1 text-xs text-[#8a6b57]">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {points > 0 ? (
            <span className="font-play rounded-full bg-[#1c1c1c] px-3 py-1 text-xs text-white">
              {points} pts
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="rounded-full p-1.5 text-[#c98b5f] transition-colors hover:bg-[#ffe0cb] hover:text-[#f56215]"
            aria-label="How reward points are calculated"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative mt-5 h-4">
        {/* Geometry layer, inset by half a rung so 0–100% maps exactly to the
            first and last dot centres. */}
        <div className="absolute inset-y-0 right-4 left-4">
          <div className="absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 rounded-full bg-[#f2e3d8]" />
          <div
            className="animate-streak-reveal absolute top-1/2 right-0 left-0 h-[3px] -translate-y-1/2 rounded-full"
            style={{
              // Fixed to the full rail, then clipped — so the colours you see
              // genuinely correspond to how far along the ladder you are, and
              // the lime end only surfaces near the 20% cap.
              backgroundImage:
                "linear-gradient(90deg, #f56215 0%, #ff8a3d 55%, #9eea01 100%)",
              clipPath: `inset(0 ${100 - fill}% 0 0)`,
            }}
          />
          {reached > 0 ? (
            <span
              className="animate-streak-flame absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-base leading-none"
              style={{ left: `${fill}%` }}
              aria-hidden="true"
            >
              <span className="animate-streak-glow block rounded-full">🔥</span>
            </span>
          ) : null}
        </div>

        <ol className="relative flex h-full items-center justify-between">
          {POINT_RATES.map((rate, index) => {
            const day = index + 1;
            const done = day <= reached;
            const isGhost = day === ghost;
            return (
              <li
                key={rate}
                className="animate-streak-node flex w-8 flex-col items-center"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    done
                      ? "bg-[#f56215]"
                      : isGhost
                        ? "bg-[#ffc7a3] ring-2 ring-[#ffe0cb]"
                        : "bg-[#e8d9cd]"
                  }`}
                />
                <span
                  className={`font-play mt-5 text-[11px] leading-none ${
                    done
                      ? "text-[#f56215]"
                      : isGhost
                        ? "text-[#c98b5f]"
                        : "text-[#c4b3a5]"
                  }`}
                >
                  {rate}%
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-4 text-center text-[11px] text-[#b09b8a]">
        Weekends off never break your streak
      </p>

      <RewardInfoModal
        open={showInfo}
        onClose={() => setShowInfo(false)}
        currentRate={nextRate}
      />
    </section>
  );
}
