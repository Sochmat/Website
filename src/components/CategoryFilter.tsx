"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ShimmerImage from "@/components/ui/ShimmerImage";
import { cn } from "@/lib/cn";

interface Category {
  id: string;
  name: string;
  image: string;
  type: "food" | "beverages";
}

interface CategoryFilterProps {
  categories: Category[];
  activeCategory: string | null;
  onCategoryChange: (categoryId: string) => void;
}

export default function CategoryFilter({
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
  }, [categories, updateScrollState]);

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
        className="flex gap-2 py-5 border-b border-[#e6e6e6] overflow-x-auto scrollbar-hide"
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onCategoryChange(cat.id)}
            className="flex flex-col items-center gap-[8px] shrink-0 w-[72px]"
          >
            <div
              className={cn(
                "w-[72px] h-[72px] rounded-[16px] border flex items-center justify-center transition-colors",
                activeCategory === cat.id
                  ? "bg-[#f56215] border-[#f56215]"
                  : "bg-[#f0f0f0] border-[#f0f0f0]"
              )}
            >
              <ShimmerImage
                src={cat.image}
                alt={cat.name}
                width={56}
                height={56}
                className="w-[56px] h-[56px] object-contain"
                wrapperClassName="w-[56px] h-[56px] rounded-lg overflow-hidden"
                unoptimized
              />
            </div>
            <p
              className={cn(
                "text-xs font-semibold leading-tight text-center transition-colors",
                activeCategory === cat.id ? "text-[#f56215]" : "text-[#222]"
              )}
            >
              {cat.name}
            </p>
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
