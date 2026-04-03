"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FeaturedCard {
  _id: string;
  title: string;
  subtitle: string;
  image: string;
  startingPrice: number;
  link: string;
}

export default function FeaturedMeal() {
  const [cards, setCards] = useState<FeaturedCard[]>([]);

  useEffect(() => {
    fetch("/api/featured-cards")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.cards.length > 0) setCards(data.cards);
      })
      .catch(() => {});
  }, []);

  if (cards.length === 0) return null;

  return (
    <div className="pt-6 pb-6">
      <div
        className="flex gap-4 overflow-x-auto px-4 pb-2 snap-x snap-mandatory"
        style={{ scrollbarWidth: "none" }}
      >
        {cards.map((card) => (
          <Link
            key={card._id}
            href={card.link || "/menu"}
            className="shrink-0 snap-start"
            style={{ width: "calc(100% - 32px)" }}
          >
            <div className="bg-white rounded-[12px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.12)] overflow-hidden relative h-[320px] cursor-pointer">
              {/* Food image */}
              <div className="absolute inset-x-0 top-0 h-[260px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image}
                  alt={card.title}
                  className="w-full h-full object-cover pointer-events-none"
                />
                {/* Gradient fade at the bottom of image */}
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
              </div>

              {/* Title & Subtitle */}
              <div className="absolute left-[11px] top-[244px] w-[calc(100%-90px)] flex flex-col gap-[2px]">
                <h3 className="text-black text-xl font-semibold leading-tight">
                  {card.title}
                </h3>
                <p className="text-[#999] text-xs leading-normal">{card.subtitle}</p>
              </div>

              {/* Price */}
              <div className="absolute right-3 top-[248px] text-right">
                <p className="text-[#444] text-[10px] uppercase tracking-wide font-normal">
                  Starting at
                </p>
                <p className="text-[#f28a1d] font-semibold leading-tight">
                  <span className="text-xs">₹</span>
                  <span className="text-xl">{card.startingPrice}</span>
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Scroll dots */}
      {cards.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {cards.map((card) => (
            <div key={card._id} className="w-1.5 h-1.5 rounded-full bg-gray-300" />
          ))}
        </div>
      )}
    </div>
  );
}
