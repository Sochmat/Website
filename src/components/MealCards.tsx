"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";

interface MealCard {
  _id: string;
  title: string;
  subtitle: string;
  images: string[];
  startingPrice: number;
  category?: string;
  link: string;
}

export default function MealCards() {
  const [cards, setCards] = useState<MealCard[]>([]);

  useEffect(() => {
    fetch("/api/meal-cards")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.cards.length > 0) setCards(data.cards);
      })
      .catch(() => {});
  }, []);

  if (cards.length === 0) return null;

  return (
    <div className="pt-6 pb-6 px-[20px]">
      <div className="flex flex-col gap-4" style={{ scrollbarWidth: "none" }}>
        {cards.map((card) => (
          <Link
            key={card._id}
            href={
              card.category
                ? `/menu?mealCategory=${card.category}&mealCardId=${card._id}`
                : card.link || "/menu"
            }
            // className="shrink-0 snap-start"
            // style={{ width: "calc(100% - 32px)" }}
          >
            <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.12)] overflow-hidden relative h-[314px] cursor-pointer">
              {/* Image area with bottom-right notch */}
              <div className="absolute inset-x-0 top-0 h-[230px] overflow-hidden">
                <ImageCarousel images={card.images} alt={card.title} />
                {/* Slanted notch cutout for price */}
                <svg
                  className="absolute bottom-[-10px] right-0"
                  style={{ width: "42%", height: "40px" }}
                  viewBox="0 0 160 40"
                  preserveAspectRatio="none"
                  fill="white"
                >
                  <path d="M38,0 Q30,0 26,6 L6,34 Q2,40 10,40 L160,40 L160,0 Z" />
                </svg>
              </div>

              {/* Title & Subtitle */}
              <div
                className="absolute left-[11px] top-[254px] flex flex-col gap-[2px]"
                style={{ width: "calc(100% - 100px)" }}
              >
                <h3 className="text-black text-[20px] font-semibold leading-[24px]">
                  {card.title}
                </h3>
                <p className="text-[#999] text-[12px] leading-[17px]">
                  {card.subtitle}
                </p>
              </div>

              {/* Price — sits inside the notch */}
              <div className="absolute right-[50px] top-[208px] text-right">
                <p className="text-[#444] text-[10px] uppercase tracking-wide font-normal leading-[21px]">
                  Starting at
                </p>
                <p className="text-[#f28a1d] font-semibold leading-[21px]">
                  <span className="text-[12px]">₹</span>
                  <span className="text-[20px]">{card.startingPrice}</span>
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Card scroll dots */}
      {/* {cards.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {cards.map((card) => (
            <div
              key={card._id}
              className="w-1.5 h-1.5 rounded-full bg-gray-300"
            />
          ))}
        </div>
      )} */}
    </div>
  );
}

function ImageCarousel({ images, alt }: { images: string[]; alt: string }) {
  const [current, setCurrent] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoPlay = useCallback(() => {
    if (images.length <= 1) return;
    intervalRef.current = setInterval(() => {
      setCurrent((prev) => (prev + 1) % images.length);
    }, 3000);
  }, [images.length]);

  const stopAutoPlay = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startAutoPlay();
    return stopAutoPlay;
  }, [startAutoPlay, stopAutoPlay]);

  if (images.length === 0) return null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[current]}
        alt={alt}
        className="w-full h-full object-cover pointer-events-none"
      />

      {/* Image dots */}
      {images.length > 1 && (
        <div className="absolute bottom-[42px] left-1/2 -translate-x-1/2 flex gap-1.5 z-[2]">
          {images.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCurrent(idx);
                stopAutoPlay();
                startAutoPlay();
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === current ? "bg-white" : "bg-white/50"
              }`}
            />
          ))}
        </div>
      )}
    </>
  );
}
