"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Tile {
  _id: string;
  label: string;
  sublabel: string;
  href: string;
  emoji: string;
  bgStyle: "gradient" | "bordered";
  order: number;
}

const FALLBACK_TILES: Tile[] = [
  {
    _id: "1",
    label: "Protein",
    sublabel: "Shakes",
    href: "/menu",
    emoji: "🥤",
    bgStyle: "gradient",
    order: 0,
  },
  {
    _id: "2",
    label: "FOOD",
    sublabel: "",
    href: "/menu",
    emoji: "🥗",
    bgStyle: "bordered",
    order: 1,
  },
  {
    _id: "3",
    label: "Chef",
    sublabel: "Special",
    href: "/menu",
    emoji: "👨‍🍳",
    bgStyle: "bordered",
    order: 2,
  },
  {
    _id: "4",
    label: "MEALS",
    sublabel: "SUBSCRIPTION",
    href: "/subscribe",
    emoji: "📅",
    bgStyle: "bordered",
    order: 3,
  },
  {
    _id: "5",
    label: "MEMBERSHIP",
    sublabel: "@₹99",
    href: "/subscribe",
    emoji: "",
    bgStyle: "bordered",
    order: 4,
  },
  {
    _id: "6",
    label: "MEALS",
    sublabel: "@₹149",
    href: "/menu",
    emoji: "",
    bgStyle: "bordered",
    order: 5,
  },
];

export default function CategoryTiles() {
  const [tiles, setTiles] = useState<Tile[]>([]);

  useEffect(() => {
    fetch("/api/tiles")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.tiles.length > 0) setTiles(data.tiles);
        else setTiles([]);
      })
      .catch(() => setTiles([]));
  }, []);

  if (tiles.length === 0) return null;

  return (
    <div className="px-4 mt-4">
      <div className="flex flex-wrap gap-[14px] justify-center">
        {tiles.map((tile) => (
          <Link
            key={tile._id}
            href={tile.href}
            className={`relative w-[96px] h-[120px] rounded-[9.6px] overflow-hidden shrink-0 flex flex-col items-center justify-center ${
              tile.bgStyle === "gradient"
                ? ""
                : "border border-[#d9d9d9] bg-white"
            }`}
            style={
              tile.bgStyle === "gradient"
                ? { background: "linear-gradient(to bottom, #ffebd6, #e58857)" }
                : undefined
            }
          >
            <p
              className={`text-[13.2px] font-semibold text-center uppercase leading-[14.4px] px-1 ${
                tile.bgStyle === "gradient"
                  ? "text-black font-bold"
                  : "text-black"
              }`}
            >
              {tile.label}
            </p>
            {tile.sublabel && (
              <p
                className={`text-center uppercase leading-[16.8px] px-1 font-semibold ${
                  tile.sublabel.startsWith("@")
                    ? "text-[24px] text-[#02583f]"
                    : tile.sublabel.length > 8
                      ? "text-[9.6px] text-[#02583f]"
                      : "text-[13.2px] text-[#02583f]"
                }`}
              >
                {tile.sublabel}
              </p>
            )}
            {tile.emoji && (
              <div className="mt-2 text-2xl leading-none">{tile.emoji}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
