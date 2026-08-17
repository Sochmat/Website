"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Shimmer from "@/components/ui/Shimmer";
import ShimmerImage from "@/components/ui/ShimmerImage";

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
        <ShimmerImage
          src={category.image}
          alt={category.name}
          width={68}
          height={68}
          className="w-[68px] h-[68px] object-contain"
          wrapperClassName="w-[68px] h-[68px] rounded-lg overflow-hidden"
          unoptimized
        />
      </div>
      <p className="text-xs font-semibold leading-tight text-center text-[#222]">
        {category.name}
      </p>
    </Link>
  );
}

/** Two rows of tiles at the real size, so the heading below doesn't jump. */
function CategoryScrollSkeleton() {
  return (
    <div className="mt-6 px-4">
      <div className="flex items-center gap-2 mb-3">
        <Shimmer rounded="rounded" className="h-3 w-40" />
        <div className="h-px flex-1 bg-[#ccc]" />
      </div>
      <div className="overflow-hidden">
        <div className="flex flex-col gap-3 w-max">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-[8px] w-[88px]">
                  <Shimmer rounded="rounded-[16px]" className="w-[88px] h-[88px]" />
                  <Shimmer rounded="rounded" className="h-3 w-14" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomeCategoryScroll() {
  // null while the menu request is outstanding; [] only once it has answered.
  const [categories, setCategories] = useState<Category[] | null>(null);
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
        } else {
          setCategories([]);
        }
      })
      .catch(() => setCategories([]));
  }, []);

  if (categories === null) return <CategoryScrollSkeleton />;
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
