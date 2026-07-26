"use client";

import Link from "next/link";
import { ArrowLeftOutlined } from "@ant-design/icons";
import ProductionItemForm from "@/components/inventory/ProductionItemForm";

export default function NewProductionItemPage() {
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
        Add production item
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Define the item, then build its recipe — the price is calculated for you.
      </p>

      <div className="mt-5">
        <ProductionItemForm item={null} />
      </div>
    </div>
  );
}
