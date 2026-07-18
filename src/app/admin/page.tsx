"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminToken");
    if (!token) {
      router.replace("/admin/login");
      return;
    }
    // Shop role can't see the dashboard; send it to orders. Admins land here.
    const role = localStorage.getItem("adminRole");
    router.replace(role === "shop" ? "/admin/orders" : "/admin/dashboard");
  }, [router]);

  return null;
}
