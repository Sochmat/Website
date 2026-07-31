"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftOutlined } from "@ant-design/icons";
import ProductionItemForm from "@/components/inventory/ProductionItemForm";
import type { ProductionItem } from "@/lib/productionItems";

export default function EditProductionItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [item, setItem] = useState<ProductionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/inventory/production-items/${id}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setItem(data.item);
        else setError(data.message ?? "Could not load this item");
      } catch {
        if (!cancelled) setError("Network error — please try again");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div>
      <Link
        href="/inventory-management/setup/production"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#024731] transition-colors"
      >
        <ArrowLeftOutlined />
        Production items
      </Link>

      <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1c1c1c]">
        Edit production item
      </h1>

      {loading && (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Mounted only once the record is in hand — the form seeds its state
          from `item` on first render, so rendering it early would strand it
          with empty fields. */}
      {!loading && !error && item && (
        <>
          <p className="mt-1 text-sm text-gray-600">
            Changing the recipe recalculates the price.
          </p>
          <div className="mt-5">
            <ProductionItemForm item={item} />
          </div>
        </>
      )}
    </div>
  );
}
