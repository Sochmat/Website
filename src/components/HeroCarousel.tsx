"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";

interface BannerSlide {
  _id: string;
  url: string;
  order: number;
}

const FALLBACK = "/bg1.png";
const AUTO_PLAY_MS = 3500;

export default function HeroCarousel() {
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/banner")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.slides.length > 0) setSlides(data.slides);
      })
      .catch(() => {});
  }, []);

  const total = slides.length;

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % total);
  }, [total]);

  const prev = () => {
    setCurrent((c) => (c - 1 + total) % total);
  };

  // Auto-play
  useEffect(() => {
    if (total < 2) return;
    timerRef.current = setTimeout(next, AUTO_PLAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [current, total, next]);

  // No slides from DB — show static fallback
  if (total === 0) {
    return (
      <div className="relative h-[160px] mt-4 mx-4 rounded-[16px] overflow-hidden">
        <Image src={FALLBACK} alt="Banner" fill className="object-cover" />
      </div>
    );
  }

  return (
    <div className="relative h-[160px] mt-4 mx-4 rounded-[16px] overflow-hidden group">
      {slides.map((slide, i) => (
        <div
          key={slide._id}
          className={`absolute inset-0 transition-opacity duration-500 ${
            i === current ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <Image
            src={slide.url}
            alt={`Banner ${i + 1}`}
            fill
            className="object-cover"
            unoptimized
          />
        </div>
      ))}

      {/* Prev / Next arrows — only show when more than 1 slide */}
      {total > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Previous"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/30 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Next"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Dots */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === current ? "bg-white" : "bg-white/50"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
