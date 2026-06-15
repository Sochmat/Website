"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { message } from "antd";
import type { AdminRole } from "@/lib/useAdminRole";

const SHOP_ALLOWED_PATHS = ["/admin/orders", "/admin/menu"];

const PAID_NOTIFIED_KEY = "admin_orders_paid_notified";
const SOUND_ENABLED_KEY = "admin_sound_enabled";
const POLL_INTERVAL_MS = 10_000;
// How far back (by createdAt) to scan for orders that may have just been paid.
const PAID_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const SOUND_PATH = "/sounds/new-order.mp3";
const SOUND_MAX_MS = 5_000;

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
    loading: storeLoading,
    setOpen: setStoreOpen,
  } = useStoreStatus();
  const [storeToggleBusy, setStoreToggleBusy] = useState(false);

  const handleStoreToggle = async () => {
    if (storeToggleBusy || storeLoading) return;
    setStoreToggleBusy(true);
    const ok = await setStoreOpen(!storeOpen);
    setStoreToggleBusy(false);
    if (!ok) message.error("Failed to update store status");
    else message.success(`Store ${!storeOpen ? "opened" : "closed"}`);
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

  const playSuccessTone = () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = 0;
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
    stopTimerRef.current = window.setTimeout(() => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    }, SOUND_MAX_MS);
  };

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
    if (pathname === "/admin/login") return;
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

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    localStorage.removeItem("adminRole");
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
      <header className="bg-[#1c1c1c] text-white px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">Sochmat Admin</h1>
        <nav className="flex items-center gap-4">
          <Link
            href="/admin/menu"
            className={`font-medium ${
              pathname === "/admin/menu" ? "underline" : "hover:underline"
            }`}
          >
            Menu
          </Link>
          {!isShop && (
            <>
              <Link
                href="/admin/banner"
                className={`font-medium ${
                  pathname === "/admin/banner" ? "underline" : "hover:underline"
                }`}
              >
                Banner
              </Link>
              <Link
                href="/admin/tiles"
                className={`font-medium ${
                  pathname === "/admin/tiles" ? "underline" : "hover:underline"
                }`}
              >
                Tiles
              </Link>
              <Link
                href="/admin/meal-cards"
                className={`font-medium ${
                  pathname === "/admin/meal-cards"
                    ? "underline"
                    : "hover:underline"
                }`}
              >
                Meals
              </Link>
              <Link
                href="/admin/coupons"
                className={`font-medium ${
                  pathname === "/admin/coupons" ? "underline" : "hover:underline"
                }`}
              >
                Coupons
              </Link>
            </>
          )}
          <Link
            href="/admin/orders"
            className={`font-medium ${
              pathname === "/admin/orders" ? "underline" : "hover:underline"
            }`}
          >
            Orders
          </Link>
          {!isShop && (
            <>
              <Link
                href="/admin/subscriptions"
                className={`font-medium ${
                  pathname === "/admin/subscriptions"
                    ? "underline"
                    : "hover:underline"
                }`}
              >
                Subscriptions
              </Link>
              <Link
                href="/admin/users"
                className={`font-medium ${
                  pathname === "/admin/users" ? "underline" : "hover:underline"
                }`}
              >
                Users
              </Link>
              <button
                type="button"
                onClick={handleStoreToggle}
                disabled={storeToggleBusy || storeLoading}
                className={`px-4 py-2 rounded-lg font-medium transition-colors text-white ${
                  storeOpen
                    ? "bg-[#024731] hover:bg-[#013a28]"
                    : "bg-red-600 hover:bg-red-700"
                } ${storeToggleBusy || storeLoading ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                Store: {storeOpen ? "ON" : "OFF"}
              </button>
            </>
          )}
          <button
            onClick={handleLogout}
            className="bg-white text-[#1c1c1c] px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Logout
          </button>
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
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}
