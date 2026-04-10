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
              <Link
                key={cat.id}
                href={`/menu?category=${cat.id}`}
                className="flex flex-col items-center shrink-0 w-[100px]"
              >
                <div className="w-[100px] h-[100px] rounded-full overflow-hidden flex items-center justify-center">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    width={100}
                    height={100}
                    className="w-full h-full object-contain"
                    unoptimized
                  />
                </div>
                <p className="mt-1.5 text-xs font-medium text-[#444] text-center leading-tight">
                  {cat.name}
                </p>
              </Link>
            ))}
          </div>

          {/* Row 2 */}
          {row2.length > 0 && (
            <div className="flex gap-3">
              {row2.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/menu?category=${cat.id}`}
                  className="flex flex-col items-center shrink-0 w-[100px]"
                >
                  <div className="w-[100px] h-[100px] rounded-full overflow-hidden flex items-center justify-center">
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      width={100}
                      height={100}
                      className="w-full h-full object-contain"
                      unoptimized
                    />
                  </div>
                  <p className="mt-1.5 text-xs font-medium text-[#444] text-center leading-tight">
                    {cat.name}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
