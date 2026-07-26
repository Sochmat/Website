"use client";

import Link from "next/link";
import { ArrowLeftOutlined } from "@ant-design/icons";
import ItemRecipeForm from "@/components/inventory/ItemRecipeForm";

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
      </p>

      <div className="mt-5">
        <ItemRecipeForm recipe={null} />
      </div>
    </div>
  );
}
