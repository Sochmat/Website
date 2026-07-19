"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { message } from "antd";
import { LogoutOutlined } from "@ant-design/icons";
import type { AdminRole } from "@/lib/useAdminRole";

const SHOP_ALLOWED_PATHS = ["/admin/orders", "/admin/menu"];

// Admin navigation, in display order. `adminOnly` items are hidden for the
// shop role (which only ever reaches Menu and Orders — see SHOP_ALLOWED_PATHS).
const NAV_ITEMS: { href: string; label: string; adminOnly: boolean }[] = [
  { href: "/admin/dashboard", label: "Dashboard", adminOnly: true },
  { href: "/admin/menu", label: "Menu", adminOnly: false },
  { href: "/admin/banner", label: "Banner", adminOnly: true },
  { href: "/admin/tiles", label: "Tiles", adminOnly: true },
  { href: "/admin/meal-cards", label: "Meals", adminOnly: true },
  { href: "/admin/coupons", label: "Coupons", adminOnly: true },
  { href: "/admin/orders", label: "Orders", adminOnly: false },
  { href: "/admin/subscription-plans", label: "Subscriptions", adminOnly: true },
  { href: "/admin/subscription-menu", label: "Subscription Menu", adminOnly: true },
  { href: "/admin/subscription-brackets", label: "Subscription Brackets", adminOnly: true },
  { href: "/admin/users", label: "Users", adminOnly: true },
  { href: "/admin/payment-logs", label: "Payment Logs", adminOnly: true },
  { href: "/admin/store-hours", label: "Store Hours", adminOnly: true },
  { href: "/admin/society-discounts", label: "Location Discounts", adminOnly: true },
];

/**
 * A live operational-status pill (Store / Delivery). The colored dot and tint
 * read the current state at a glance; clicking flips it. Disabled while a
 * toggle is in flight.
 */
function StatusToggle({
  label,
  on,
  busy,
  onClick,
}: {
  label: string;
  on: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={`${label} is ${on ? "on" : "off"} — click to turn ${on ? "off" : "on"}`}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        on
          ? "border-[#024731] bg-[#024731]/25 text-green-300 hover:bg-[#024731]/40"
          : "border-red-500/40 bg-red-500/15 text-red-300 hover:bg-red-500/25"
      } ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      <span
        className={`w-2 h-2 rounded-full ${on ? "bg-green-400" : "bg-red-400"}`}
        aria-hidden="true"
      />
      <span>
        {label}
        <span className="hidden md:inline">
          {" · "}
          {on ? "On" : "Off"}
        </span>
      </span>
    </button>
  );
}

const PAID_NOTIFIED_KEY = "admin_orders_paid_notified";
const SOUND_ENABLED_KEY = "admin_sound_enabled";
const POLL_INTERVAL_MS = 10_000;
// How far back (by createdAt) to scan for orders that may have just been paid.
const PAID_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const SOUND_PATH = "/sounds/new-order.mp3";
// Keep ringing for up to 30s, or until the order is accepted/rejected.
const SOUND_MAX_MS = 30_000;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const {
    open: storeOpen,
    deliveryOn,
    loading: storeLoading,
    setOpen: setStoreOpen,
    setDeliveryOn,
  } = useStoreStatus();
  const [storeToggleBusy, setStoreToggleBusy] = useState(false);
  const [deliveryToggleBusy, setDeliveryToggleBusy] = useState(false);

  const handleStoreToggle = async () => {
    if (storeToggleBusy || storeLoading) return;
    setStoreToggleBusy(true);
    const ok = await setStoreOpen(!storeOpen);
    setStoreToggleBusy(false);
    if (!ok) message.error("Failed to update store status");
    else message.success(`Store ${!storeOpen ? "opened" : "closed"}`);
  };

  const handleDeliveryToggle = async () => {
    if (deliveryToggleBusy || storeLoading) return;
    setDeliveryToggleBusy(true);
    const ok = await setDeliveryOn(!deliveryOn);
    setDeliveryToggleBusy(false);
    if (!ok) message.error("Failed to update delivery status");
    else message.success(`Delivery ${!deliveryOn ? "enabled" : "disabled"}`);
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const token = localStorage.getItem("adminToken");
    const storedRole = localStorage.getItem("adminRole");
    const nextRole: AdminRole | null =
      storedRole === "admin" || storedRole === "shop" ? storedRole : null;
    setRole(nextRole);

    const isLoginPage = pathname === "/admin/login";
    if (!isLoginPage && !token) {
      router.replace("/admin/login");
      return;
    }
    if (
      nextRole === "shop" &&
      !isLoginPage &&
      pathname !== "/admin" &&
      !SHOP_ALLOWED_PATHS.includes(pathname)
    ) {
      router.replace("/admin/orders");
    }
  }, [mounted, pathname, router]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    audioRef.current = new Audio(SOUND_PATH);
    audioRef.current.preload = "auto";
    setSoundEnabled(localStorage.getItem(SOUND_ENABLED_KEY) === "1");
  }, [mounted]);

  const stopSound = () => {
    const audio = audioRef.current;
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (!audio) return;
    try {
      audio.pause();
      audio.loop = false;
      audio.currentTime = 0;
    } catch {
      // ignore
    }
  };

  const playSuccessTone = () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      // Loop so a short clip keeps ringing for the full window.
      audio.loop = true;
    } catch {
      // ignore
    }
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        localStorage.removeItem(SOUND_ENABLED_KEY);
        setSoundEnabled(false);
      });
    }
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(stopSound, SOUND_MAX_MS);
  };

  // Stop the new-order ring the moment an order is accepted/rejected.
  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const handler = () => stopSound();
    window.addEventListener("admin:order-handled", handler);
    return () => window.removeEventListener("admin:order-handled", handler);
  }, [mounted]);

  const enableSound = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.muted = true;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      localStorage.setItem(SOUND_ENABLED_KEY, "1");
      setSoundEnabled(true);
    } catch {
      setSoundEnabled(false);
    }
  };

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    // Only poll for new paid orders while the Orders page is open — no need to
    // hit /api/orders from every other admin route.
    if (pathname !== "/admin/orders") return;
    const token = localStorage.getItem("adminToken");
    if (!token) return;

    let cancelled = false;

    // Ring only when an order's payment is registered as "paid". We remember
    // the set of paid order ids already notified (persisted, so a reload does
    // not re-ring). On the very first run we seed the set silently so orders
    // that were already paid before the page opened don't trigger the sound.
    const checkForPaidOrders = async () => {
      try {
        const since = new Date(Date.now() - PAID_LOOKBACK_MS).toISOString();
        const res = await fetch(
          `/api/orders?gte=${encodeURIComponent(since)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled || !data?.success || !Array.isArray(data.orders)) return;

        const paidIds: string[] = data.orders
          .filter(
            (o: { _id?: string; paymentStatus?: string }) =>
              String(o.paymentStatus ?? "") === "paid" && o._id,
          )
          .map((o: { _id?: string }) => String(o._id));

        const raw = localStorage.getItem(PAID_NOTIFIED_KEY);
        // Persist the current paid ids for the next poll. This also prunes ids
        // that have aged out of the look-back window, keeping the set bounded.
        localStorage.setItem(PAID_NOTIFIED_KEY, JSON.stringify(paidIds));

        // First run — seeded silently above, so don't ring.
        if (raw === null) return;

        let prev: string[] = [];
        try {
          prev = JSON.parse(raw) as string[];
        } catch {
          prev = [];
        }
        const prevSet = new Set(prev);
        const newlyPaid = paidIds.filter((id) => !prevSet.has(id));
        if (newlyPaid.length > 0) playSuccessTone();
      } catch {
        // ignore
      }
    };

    checkForPaidOrders();
    const interval = window.setInterval(checkForPaidOrders, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    };
  }, [mounted, pathname]);

  const handleLogout = async () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
    // Clear the server session cookie too, so the token can't be reused.
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore — local state is cleared regardless
    }
    router.replace("/admin/login");
  };

  const isShop = role === "shop";

  const token =
    mounted && typeof window !== "undefined"
      ? localStorage.getItem("adminToken")
      : null;
  const isLoginPage = pathname === "/admin/login";
  const isAdminRoot = pathname === "/admin";

  if (!mounted) return null;
  if (isLoginPage || isAdminRoot) return <>{children}</>;
  if (!token) return null;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="sticky top-0 z-30 bg-[#1c1c1c] text-white shadow-sm">
        {/* Top row: brand · operational status · account */}
        <div className="px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/admin" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded-lg bg-[#024731] flex items-center justify-center font-bold text-sm text-white">
              S
            </span>
            <span className="leading-tight">
              <span className="block font-bold tracking-tight">Sochmat</span>
              <span className="block text-[11px] text-gray-400 -mt-0.5">
                Admin console
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            {!isShop && (
              <>
                <StatusToggle
                  label="Store"
                  on={storeOpen}
                  busy={storeToggleBusy || storeLoading}
                  onClick={handleStoreToggle}
                />
                <StatusToggle
                  label="Delivery"
                  on={deliveryOn}
                  busy={deliveryToggleBusy || storeLoading}
                  onClick={handleDeliveryToggle}
                />
                <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
              </>
            )}
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-white/10 hover:text-white transition-colors"
            >
              <LogoutOutlined />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {/* Nav row: pill tabs, horizontally scrollable on narrow screens */}
        <nav className="border-t border-white/10 px-6">
          <div className="flex items-center gap-1 overflow-x-auto py-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_ITEMS.filter((item) => !item.adminOnly || !isShop).map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-white text-[#111] shadow-sm"
                      : "text-gray-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>
      {!soundEnabled && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-3 flex items-center justify-between gap-3">
          <span className="text-sm text-yellow-900">
            🔔 Enable order notification sound. Chrome blocks autoplay until you
            interact with the page.
          </span>
          <button
            type="button"
            onClick={enableSound}
            className="bg-[#1c1c1c] text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#024731]"
          >
            Enable sound
          </button>
        </div>
      )}
      <main className="p-6 mx-auto">{children}</main>
    </div>
  );
}
