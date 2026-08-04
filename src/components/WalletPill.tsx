"use client";

import Link from "next/link";
import { useUser } from "@/context/UserContext";
import WalletIcon from "@/components/WalletIcon";

/**
 * The signed-in customer's wallet balance, shown in the homepage header.
 *
 * The balance rides along on `/api/users/me` (already fetched on every load by
 * UserProvider), so this renders without a request of its own.
 *
 * Hidden for signed-out visitors — a balance means nothing without an account.
 * Shown at ₹0 for signed-in ones, so the pill keeps a stable position in the
 * header instead of appearing and vanishing as the balance is spent.
 */
export default function WalletPill() {
  const { user, isAuthenticated, isLoading } = useUser();

  // Nothing during the session check either: flashing a ₹0 pill that then
  // corrects itself is worse than a beat of empty space.
  if (isLoading || !isAuthenticated) return null;

  const balance = Math.max(0, Math.round(Number(user?.walletBalance ?? 0)));

  // Light surface on purpose: the icon's navy outlines and green note need a
  // pale background to read at this size — on a dark-green pill they vanished.
  //
  // `self-stretch` takes the height from the flex line, which the logo sets, so
  // the pill tracks the logo instead of hard-coding a number that drifts when
  // the logo shrinks on narrow screens.
  return (
    <Link
      href="/refer"
      aria-label={`Wallet balance ₹${balance}. View your wallet.`}
      className="shrink-0 self-stretch flex items-center justify-center gap-1.5 rounded-full border border-[#e6e6e6] bg-white px-3 text-[#1c1c1c] shadow-sm transition-colors hover:border-[#024731]"
    >
      <WalletIcon className="w-5 h-5 shrink-0 animate-wallet-coin" />
      <span className="text-[13px] font-semibold leading-none tabular-nums">
        ₹{balance.toLocaleString("en-IN")}
      </span>
    </Link>
  );
}
