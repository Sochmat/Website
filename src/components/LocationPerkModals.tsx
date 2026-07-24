"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useLocation } from "@/context/LocationContext";
import WelcomeLocationModal from "@/components/WelcomeLocationModal";
import LocationDiscountModal from "@/components/LocationDiscountModal";

/** localStorage key: society ids whose perk has already been celebrated. */
const PERK_SEEN_KEY = "sochmat_location_perk_seen";

function seenSocieties(): string[] {
  try {
    const raw = localStorage.getItem(PERK_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    // Unreadable/absent storage — treat as "nothing celebrated yet".
    return [];
  }
}

function markSeen(societyId: string) {
  try {
    const next = Array.from(new Set([...seenSocieties(), societyId]));
    localStorage.setItem(PERK_SEEN_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private mode) — the perk just shows again later.
  }
}

/** Storage is only readable after hydration; nothing here ever re-subscribes. */
const noopSubscribe = () => () => {};

/**
 * Owns the home page's location modals and the order they appear in: the
 * first-visit picker (plus any society launch notice) runs to completion first,
 * then the location's flat discount is celebrated once per society.
 *
 * The perk waits for `discountsLoaded` so it never flashes at 0% while the
 * per-society discounts are still in flight.
 */
export default function LocationPerkModals() {
  const { society, societyDiscountPercent, discountsLoaded } = useLocation();
  const [welcomeDone, setWelcomeDone] = useState(false);
  // Societies dismissed in this session. Also the signal that re-reads storage
  // after a dismissal is written.
  const [dismissed, setDismissed] = useState<string[]>([]);
  // False during SSR and the first client render, so the perk can never cause a
  // hydration mismatch by reading localStorage too early.
  const hydrated = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const handleWelcomeDone = useCallback(() => setWelcomeDone(true), []);

  const alreadySeen = useMemo(
    () =>
      !hydrated ||
      dismissed.includes(society.id) ||
      seenSocieties().includes(society.id),
    [hydrated, dismissed, society.id],
  );

  const perkOpen =
    welcomeDone && discountsLoaded && societyDiscountPercent > 0 && !alreadySeen;

  const handlePerkClose = () => {
    markSeen(society.id);
    setDismissed((prev) =>
      prev.includes(society.id) ? prev : [...prev, society.id],
    );
  };

  return (
    <>
      <WelcomeLocationModal onDone={handleWelcomeDone} />
      <LocationDiscountModal open={perkOpen} onClose={handlePerkClose} />
    </>
  );
}
