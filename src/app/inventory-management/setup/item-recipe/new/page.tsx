"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftOutlined } from "@ant-design/icons";
import ItemRecipeForm from "@/components/inventory/ItemRecipeForm";

/**
 * Reads the `name` the list screen passes when mapping a menu item.
 *
 * Split out behind Suspense because useSearchParams opts the whole route out
 * of prerendering unless the read is isolated like this.
 */
function NewItemRecipeForm() {
  const initialName = useSearchParams().get("name") ?? "";
  return <ItemRecipeForm recipe={null} initialName={initialName} />;
}

export default function NewItemRecipePage() {
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
        Add item recipe
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Name the item, then add its components — the cost is calculated for you.
        A recipe is matched to its menu item by name, so keep the two identical.
      </p>

      <div className="mt-5">
        <Suspense fallback={null}>
          <NewItemRecipeForm />
        </Suspense>
      </div>
    </div>
  );
}
