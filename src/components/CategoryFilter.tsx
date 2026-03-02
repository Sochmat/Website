"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

interface Category {
  id: string;
  name: string;
  image: string;
  type: "food" | "beverages";
}

interface CategoryFilterProps {
  activeTab: "food" | "beverages";
  categories: Category[];
  activeCategory: string | null;
  onCategoryChange: (categoryId: string) => void;
}

export default function CategoryFilter({
  activeTab,
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  console.log({ categories, activeCategory });
  return (
    <div className="flex gap-4 py-5 border-b border-[#e6e6e6] overflow-x-auto scrollbar-hide">
      {categories
        .filter((cat) => cat.type === activeTab)
        .map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(cat.id)}
            className="flex flex-col items-center shrink-0"
          >
            <div
              className={cn(
                "relative w-[78px] h-[78px] border-5 border-[#02583f] rounded-full",
                activeCategory === cat.id
                  ? "border-[#02583f]"
                  : "border-[#e6e6e6]",
              )}
            >
              <div
                className={`absolute inset-0 rounded-full transition-colors ${
                  activeCategory === cat.id ? "bg-[#02583f]" : "bg-transparent"
                }`}
              />
              <Image
                src={cat.image}
                alt={cat.name}
                width={78}
                height={78}
                className="relative w-[78px] h-[78px] object-cover rounded-full"
                unoptimized
              />
            </div>
            <span className="text-[#222] text-xs font-semibold mt-2">
              {cat.name}
            </span>
          </button>
        ))}
    </div>
  );
}
