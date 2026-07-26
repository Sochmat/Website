"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The console has no landing screen of its own — Dashboard is the entry point. */
export default function InventoryManagementPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inventory-management/dashboard");
  }, [router]);

  return null;
}
