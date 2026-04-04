"use client";

import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Menu from "@/components/Menu";
import CartBar from "@/components/CartBar";

interface MealCardData {
  _id: string;
  title: string;
  images: string[];
}

function MealCardHeader({ cardId }: { cardId: string }) {
  const [card, setCard] = useState<MealCardData | null>(null);

  useEffect(() => {
    fetch("/api/meal-cards")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const found = data.cards.find((c: MealCardData) => c._id === cardId);
          if (found) setCard(found);
        }
      })
      .catch(() => {});
  }, [cardId]);

  if (!card) return null;

  return (
    <div className="mb-4">
      {/* Back + Title */}
      <div className="flex items-center gap-2 mb-3">
        <Link href="/" className="shrink-0 p-1">
          <svg
            className="w-5 h-5 text-[#111]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <h2 className="text-black text-[22px] font-semibold">{card.title}</h2>
      </div>
      {/* Image carousel */}
      <div className="w-full h-[220px] overflow-hidden rounded-[12px] relative">
        <MealCardCarousel images={card.images} alt={card.title} />
      </div>
    </div>
  );
}

function MealCardCarousel({ images, alt }: { images: string[]; alt: string }) {
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
        className="w-full h-full object-cover"
      />
      {images.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-[2]">
          {images.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
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

function MenuContent() {
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const mealCategory = searchParams.get("mealCategory");
  const mealCardId = searchParams.get("mealCardId");

  return (
    <div className="px-4 pt-8 pb-4">
      {mealCardId && <MealCardHeader cardId={mealCardId} />}
      <Menu
        showTitle={!mealCardId}
        linkCategoriesToMenu={false}
        initialCategory={category === "beverages" ? "beverages" : "food"}
        initialActiveCategory={mealCategory || null}
        hideHeader={!!mealCardId}
      />
    </div>
  );
}

export default function MenuPage() {
  return (
    <main className="min-h-screen bg-white max-w-[430px] mx-auto pb-32">
      <Suspense
        fallback={
          <div className="px-4 pt-8 pb-4 text-center text-gray-500 py-12">
            Loading menu...
          </div>
        }
      >
        <MenuContent />
      </Suspense>

      <CartBar />

      {/* <Link
        href="/"
        className="fixed top-20 left-4 bg-white p-2 rounded-full shadow-md z-50"
      >
        <svg
          className="w-5 h-5 text-[#111]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </Link> */}
    </main>
  );
}
