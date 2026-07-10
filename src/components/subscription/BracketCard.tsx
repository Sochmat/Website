"use client";

import { rupees, type BracketOption } from "./types";

export default function BracketCard({
  bracket,
  onSelect,
}: {
  bracket: BracketOption;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border-2 border-transparent hover:border-[#f56215] transition-colors"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xl font-bold text-[#111]">
          {bracket.proteinMin}–{bracket.proteinMax}g
        </span>
        <span className="text-sm font-semibold text-[#f56215]">
          {rupees(bracket.vegPrice)}–{rupees(bracket.nonVegPrice)}
          <span className="text-xs font-normal text-[#737373]"> / meal</span>
        </span>
      </div>
      <p className="text-xs text-[#737373] mt-1">protein per meal</p>
    </button>
  );
}
