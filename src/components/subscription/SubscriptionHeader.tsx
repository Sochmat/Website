"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, MapPin, ReceiptText, Ticket, User } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import SelectAddressSheet from "@/components/SelectAddressSheet";
import LocationSelector from "@/components/LocationSelector";
import type { CreditAccounting } from "@/lib/subscriptionSchedule";
import type { UserAddress } from "@/lib/types";

/**
 * The subscription app's account bar. A single sticky top bar shared by every
 * /subscription page via subscription/layout.tsx.
 *
 * The user button opens a dropdown: "Log in" when signed out; otherwise the
 * customer's name/phone plus links to their subscriptions, a live meal-credit
 * total, a saved-address manager, and log out.
 */
export default function SubscriptionHeader() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useUser();
  const { openLoginPopup } = useLoginPopup();

  const [menuOpen, setMenuOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  // Address manager (reuses the same sheets the checkout uses).
  const [showAddresses, setShowAddresses] = useState(false);
  const [showLocationSelector, setShowLocationSelector] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);

  const addresses = isAuthenticated ? user?.addresses ?? [] : [];

  // Total available meal credits across the customer's paid plans.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    fetch("/api/subscriptions/plans")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || !d?.success || !Array.isArray(d.plans)) return;
        const total = (d.plans as Array<{ accounting?: CreditAccounting; paymentStatus: string }>)
          .filter((p) => p.paymentStatus === "paid")
          .reduce((sum, p) => sum + (p.accounting?.available ?? 0), 0);
        setCredits(total);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const closeMenu = () => setMenuOpen(false);

  const handleLogout = () => {
    logout();
    closeMenu();
    setCredits(null);
    router.push("/subscription");
  };

  const go = (href: string) => {
    closeMenu();
    router.push(href);
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 max-w-[430px] mx-auto h-14 px-4 flex items-center justify-between">
        <Link href="/subscription" className="font-bold text-[#111] text-[15px]">
          Sochmat
          <span className="text-[#f56215]">.</span>
          <span className="ml-1 font-medium text-[#737373] text-xs">Subscriptions</span>
        </Link>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Account"
          aria-expanded={menuOpen}
          className="w-9 h-9 rounded-full bg-[#f5f5f5] flex items-center justify-center text-[#111] active:scale-95 transition-transform"
        >
          <User className="w-5 h-5" />
        </button>

        {menuOpen && (
          <>
            {/* Click-away backdrop */}
            <button
              type="button"
              aria-label="Close menu"
              onClick={closeMenu}
              className="fixed inset-0 z-40 cursor-default"
            />
            <div className="absolute right-4 top-full mt-1 z-50 w-60 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              {isAuthenticated ? (
                <>
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="font-semibold text-[#111] truncate">
                      {user?.name || "Your account"}
                    </p>
                    {user?.phone && (
                      <p className="text-xs text-[#737373] truncate">{user.phone}</p>
                    )}
                  </div>

                  <MenuRow
                    icon={<ReceiptText className="w-4 h-4" />}
                    label="My subscriptions"
                    onClick={() => go("/subscription/orders")}
                  />
                  <MenuRow
                    icon={<Ticket className="w-4 h-4" />}
                    label="Meal credits"
                    trailing={credits === null ? undefined : `${credits} left`}
                    onClick={() => go("/subscription/orders")}
                  />
                  <MenuRow
                    icon={<MapPin className="w-4 h-4" />}
                    label="Saved addresses"
                    onClick={() => {
                      closeMenu();
                      setShowAddresses(true);
                    }}
                  />
                  <MenuRow
                    icon={<LogOut className="w-4 h-4" />}
                    label="Log out"
                    onClick={handleLogout}
                    danger
                  />
                </>
              ) : (
                <MenuRow
                  icon={<LogIn className="w-4 h-4" />}
                  label="Log in"
                  onClick={() => {
                    closeMenu();
                    openLoginPopup();
                  }}
                />
              )}
            </div>
          </>
        )}
      </header>

      {/* Saved-addresses manager — same sheets the checkout uses. */}
      <SelectAddressSheet
        open={showAddresses && !showLocationSelector}
        onClose={() => {
          setShowAddresses(false);
          setEditingAddress(null);
        }}
        addresses={addresses}
        selectedAddress={null}
        onSelect={() => setShowAddresses(false)}
        onAddNew={() => {
          setEditingAddress(null);
          setShowAddresses(false);
          setShowLocationSelector(true);
        }}
        onEdit={(addr) => {
          setEditingAddress(addr);
          setShowAddresses(false);
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
        onSaved={() => {
          // The embedded AddAddressSheet already persisted + updated UserContext.
          setShowLocationSelector(false);
          setEditingAddress(null);
        }}
      />
    </>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-[#fafafa] transition-colors ${
        danger ? "text-red-600" : "text-[#111]"
      }`}
    >
      <span className={danger ? "text-red-500" : "text-[#737373]"}>{icon}</span>
      <span className="flex-1">{label}</span>
      {trailing && (
        <span className="text-xs font-semibold text-[#009940]">{trailing}</span>
      )}
    </button>
  );
}
