"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { DEFAULT_LADDER } from "@/lib/streakLadder";

export interface RewardSummary {
  /** Spendable reward points (1 point = ₹1). */
  points: number;
  /** Order days already banked this calendar month. */
  streak: number;
  /** The day count an order placed right now would produce. */
  nextStreak: number;
  /** The rate (%) an order placed right now would earn. */
  nextRate: number;
  /** The location's ladder — earn percentages by order day. */
  rates: number[];
  /** False when this location is opted out of the streak entirely. */
  enabled: boolean;
}

/**
 * The signed-in customer's reward summary, or null while it loads (and always
 * for a signed-out visitor). Shared by the homepage streak timeline and the
 * nav menu so both read the same numbers from one place.
 *
 * `societyId` selects which location's ladder the rates come from. Pass the
 * location the customer is ordering to; omit it for the default ladder.
 */
export function useRewardSummary(
  societyId?: string | null,
): RewardSummary | null {
  const { isAuthenticated } = useUser();
  const [summary, setSummary] = useState<RewardSummary | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    const query = societyId
      ? `?societyId=${encodeURIComponent(societyId)}`
      : "";
    fetch(`/api/rewards/me${query}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setSummary({
          points: Number(data.points ?? 0),
          streak: Number(data.streak ?? 0),
          nextStreak: Number(data.nextStreak ?? 1),
          nextRate: Number(data.nextRate ?? DEFAULT_LADDER[0]),
          rates: Array.isArray(data.rates) && data.rates.length
            ? (data.rates as number[])
            : DEFAULT_LADDER,
          enabled: data.enabled !== false,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, societyId]);

  // Signing out must drop the previous customer's numbers immediately rather
  // than waiting for a fetch that will never come.
  return isAuthenticated ? summary : null;
}
