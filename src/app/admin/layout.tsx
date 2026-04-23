"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LAST_SEEN_KEY = "admin_orders_last_seen";
const SOUND_ENABLED_KEY = "admin_sound_enabled";
const POLL_INTERVAL_MS = 20_000;
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const token = localStorage.getItem("adminToken");
    const isLoginPage = pathname === "/admin/login";
    if (!isLoginPage && !token) {
      router.replace("/admin/login");
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

    if (!localStorage.getItem(LAST_SEEN_KEY)) {
      localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    }

    let cancelled = false;

    const checkForNewOrders = async () => {
      try {
        const lastSeen =
          localStorage.getItem(LAST_SEEN_KEY) ?? new Date().toISOString();
        const res = await fetch(
          `/api/orders?gte=${encodeURIComponent(lastSeen)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (cancelled || !data?.success || !Array.isArray(data.orders)) return;
        const fresh = data.orders.filter((o: { createdAt?: string }) => {
          if (!o.createdAt) return false;
          return new Date(o.createdAt).getTime() > new Date(lastSeen).getTime();
        });
        if (fresh.length === 0) return;
        const newest = fresh.reduce((max: string, o: { createdAt?: string }) => {
          const t = o.createdAt ?? "";
          return new Date(t).getTime() > new Date(max).getTime() ? t : max;
        }, lastSeen);
        localStorage.setItem(LAST_SEEN_KEY, newest);
        playSuccessTone();
      } catch {
        // ignore
      }
    };

    const interval = window.setInterval(checkForNewOrders, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    };
  }, [mounted, pathname]);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    router.replace("/admin/login");
  };

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
              pathname === "/admin/meal-cards" ? "underline" : "hover:underline"
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
          <Link
            href="/admin/orders"
            className={`font-medium ${
              pathname === "/admin/orders" ? "underline" : "hover:underline"
            }`}
          >
            Orders
          </Link>
          <Link
            href="/admin/subscriptions"
            className={`font-medium ${
              pathname === "/admin/subscriptions" ? "underline" : "hover:underline"
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
