"use client";

import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";

export interface RewardSummary {
  /** Spendable reward points (1 point = ₹1). */
  points: number;
  /** Streak days already banked. */
  streak: number;
  /** The streak an order placed right now would produce. */
  nextStreak: number;
  /** The rate (%) an order placed right now would earn. */
  nextRate: number;
}

/**
 * The signed-in customer's reward summary, or null while it loads (and always
 * for a signed-out visitor). Shared by the homepage streak timeline and the
 * nav menu so both read the same numbers from one place.
 */
export function useRewardSummary(): RewardSummary | null {
  const { isAuthenticated } = useUser();
  const [summary, setSummary] = useState<RewardSummary | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetch("/api/rewards/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success) return;
        setSummary({
          points: Number(data.points ?? 0),
          streak: Number(data.streak ?? 0),
          nextStreak: Number(data.nextStreak ?? 1),
          nextRate: Number(data.nextRate ?? 10),
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Signing out must drop the previous customer's numbers immediately rather
  // than waiting for a fetch that will never come.
  return isAuthenticated ? summary : null;
}
