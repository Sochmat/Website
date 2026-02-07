"use client";

import Image from "next/image";

interface Category {
  id: string;
  name: string;
  image: string;
}

interface CategoryFilterProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (categoryId: string) => void;
}

export default function CategoryFilter({
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  return (
    <div className="flex gap-4 py-5 border-b border-[#e6e6e6] overflow-x-auto scrollbar-hide">
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onCategoryChange(cat.id)}
          className="flex flex-col items-center shrink-0"
        >
          <div className="w-[78px] h-[78px] rounded-full border border-white p-1.5">
            <div
              className={`w-full h-full rounded-full flex items-center justify-center overflow-hidden transition-colors ${
                activeCategory === cat.id ? "bg-[#02583f]" : "bg-[#f0f0f0]"
              }`}
            >
              <Image
                src={cat.image}
                alt={cat.name}
                width={70}
                height={70}
                className="object-cover scale-150 -translate-y-2"
                unoptimized
              />
            </div>
          </div>
          <span className="text-[#222] text-xs font-semibold mt-2">
            {cat.name}
          </span>
        </button>
      ))}
    </div>
  );
}
