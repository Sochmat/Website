"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
    setHasScrolled(false);
  }, [activeTab, categories, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      updateScrollState();
      if (!hasScrolled) setHasScrolled(true);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasScrolled, updateScrollState]);

  const scroll = (direction: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: direction === "left" ? -200 : 200,
      behavior: "smooth",
    });
  };

  const showLeft = canScrollLeft && !hasScrolled;
  const showRight = canScrollRight && !hasScrolled;

  return (
    <div className="relative">
      {showLeft && (
        <button
          type="button"
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center animate-bounce-x-left"
        >
          <svg
            className="w-4 h-4 text-[#333]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-4 py-5 border-b border-[#e6e6e6] overflow-x-auto scrollbar-hide"
      >
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
                  "relative w-[80px]",
                  activeCategory === cat.id
                    ? "border-[#02583f]"
                    : "border-[#e6e6e6]",
                )}
              >
                <div
                  className={`absolute w-[60px] h-[60px] left-1/2 -translate-x-1/2 top-[35px] -translate-y-1/2 rounded-full transition-colors z-1 ${
                    activeCategory === cat.id ? "bg-[#02583f]" : "bg-[#f0f0f0]"
                  }`}
                />
                <Image
                  src={cat.image}
                  alt={cat.name}
                  width={78}
                  height={78}
                  className="w-[78px] h-[78px] object-contain z-2 relative"
                  unoptimized
                />
                <p className="text-[#222] text-xs font-semibold leading-tight">
                  {cat.name}
                </p>
              </div>
            </button>
          ))}
      </div>

      {showRight && (
        <button
          type="button"
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center animate-bounce-x-right"
        >
          <svg
            className="w-4 h-4 text-[#333]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
