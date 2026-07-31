"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  image: string;
  type: "food" | "beverages";
}

/** Same tile treatment as the menu's CategoryFilter, minus the active state —
 *  these navigate rather than filter, so none of them is ever selected. */
function CategoryTile({ category }: { category: Category }) {
  return (
    <Link
      href={`/menu?category=${category.id}`}
      className="flex flex-col items-center gap-[8px] shrink-0 w-[88px]"
    >
      <div className="w-[88px] h-[88px] rounded-[16px] border border-[#f0f0f0] bg-[#f0f0f0] flex items-center justify-center">
        <Image
          src={category.image}
          alt={category.name}
          width={68}
          height={68}
          className="w-[68px] h-[68px] object-contain"
          unoptimized
        />
      </div>
      <p className="text-xs font-semibold leading-tight text-center text-[#222]">
        {category.name}
      </p>
    </Link>
  );
}

export default function HomeCategoryScroll() {
  const [categories, setCategories] = useState<Category[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/menu")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.categories?.length > 0) {
          setCategories(
            data.categories.map(
              (c: {
                _id?: string;
                id?: string;
                name: string;
                image: string;
                type: string;
              }) => ({
                id: c.id ?? c._id,
                name: c.name,
                image: c.image,
                type: c.type,
              }),
            ),
          );
        }
      })
      .catch(() => {});
  }, []);

  if (categories.length === 0) return null;

  // Split categories into two rows
  const mid = Math.ceil(categories.length / 2);
  const row1 = categories.slice(0, mid);
  const row2 = categories.slice(mid);

  return (
    <div className="mt-6 px-4">
      {/* Heading */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold tracking-wide text-[#444] uppercase whitespace-nowrap">
          Pick what you crave for
        </span>
        <div className="h-px flex-1 bg-[#ccc]" />
      </div>

      {/* Scrollable rows */}
      <div ref={scrollRef} className="overflow-x-auto scrollbar-hide">
        <div className="flex flex-col gap-3 w-max">
          {/* Row 1 */}
          <div className="flex gap-3">
            {row1.map((cat) => (
              <CategoryTile key={cat.id} category={cat} />
            ))}
          </div>

          {/* Row 2 */}
          {row2.length > 0 && (
            <div className="flex gap-3">
              {row2.map((cat) => (
                <CategoryTile key={cat.id} category={cat} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
