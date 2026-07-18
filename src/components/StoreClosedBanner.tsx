"use client";

import { useStoreStatus } from "@/context/StoreStatusContext";

export default function StoreClosedBanner() {
  const { open, loading, opensAtLabel } = useStoreStatus();
  if (loading || open) return null;
  return (
    <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-3 text-center">
      <p className="text-sm font-medium text-yellow-900">
        {opensAtLabel
          ? `Store is currently closed — opens at ${opensAtLabel}.`
          : "Store is currently closed — orders will resume soon."}
      </p>
    </div>
  );
}
