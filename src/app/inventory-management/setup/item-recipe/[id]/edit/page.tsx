"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftOutlined } from "@ant-design/icons";
import ItemRecipeForm from "@/components/inventory/ItemRecipeForm";
import type { ItemRecipe } from "@/lib/itemRecipes";

export default function EditItemRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [recipe, setRecipe] = useState<ItemRecipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/inventory/item-recipes/${id}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) setRecipe(data.recipe);
        else setError(data.message ?? "Could not load this recipe");
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
        href="/inventory-management/setup/item-recipe"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-[#024731] transition-colors"
      >
        <ArrowLeftOutlined />
        Item recipes
      </Link>

      <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#1c1c1c]">
        Edit item recipe
      </h1>

      {loading && <p className="mt-6 text-sm text-gray-500">Loading…</p>}

      {!loading && error && (
        <div className="mt-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Mounted only once the record is in hand — the form seeds its state
          from `recipe` on first render. */}
      {!loading && !error && recipe && (
        <div className="mt-5">
          <ItemRecipeForm recipe={recipe} />
        </div>
      )}
    </div>
  );
}
