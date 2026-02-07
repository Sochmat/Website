"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

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
      <header className="bg-[#02583f] text-white px-6 py-4 flex items-center justify-between">
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
            href="/admin/users"
            className={`font-medium ${
              pathname === "/admin/users" ? "underline" : "hover:underline"
            }`}
          >
            Users
          </Link>
          <button
            onClick={handleLogout}
            className="bg-white text-[#02583f] px-4 py-2 rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Logout
          </button>
        </nav>
      </header>
      <main className="p-6 max-w-7xl mx-auto">{children}</main>
    </div>
  );
}
