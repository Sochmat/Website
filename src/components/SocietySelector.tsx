"use client";

import { useEffect, useRef, useState } from "react";
import { useLocation } from "@/context/LocationContext";
import { SOCIETIES } from "@/lib/societies";

export default function SocietySelector() {
  const { society, setSocietyId } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative mx-4 mt-4 w-[calc(100%-32px)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[50px] border border-[#595959] px-4 py-2.5 text-left transition-colors hover:border-[#1c1c1c]"
      >
        <svg
          className="h-4 w-4 shrink-0 text-[#f56215]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
        </svg>
        <span className="flex-1 truncate text-sm text-[#1c1c1c]">
          <span className="text-[#959595]">Deliver to: </span>
          {society.label}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-[#595959] transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
        >
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#a3a3a3]">
            Currently serving
          </p>
          {SOCIETIES.map((s) => {
            const selected = s.id === society.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setSocietyId(s.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#faf7f2] ${
                  selected ? "bg-[#fff4ec]" : ""
                }`}
              >
                <svg
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#f56215]"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" />
                </svg>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-[#1c1c1c]">
                    {s.name}
                  </span>
                  <span className="block text-xs text-[#959595]">
                    {s.sector}
                  </span>
                </span>
                {selected && (
                  <svg
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#f56215]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
