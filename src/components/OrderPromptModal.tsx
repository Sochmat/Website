"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { X, Phone } from "lucide-react";

export default function OrderPromptModal() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const shownForPaths = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (shownForPaths.current.has(pathname)) return;
    const t = setTimeout(() => {
      shownForPaths.current.add(pathname);
      setOpen(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [pathname]);

  const close = () => setOpen(false);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/40 transition-opacity"
        onClick={close}
        aria-hidden
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-[201] max-w-[430px] mx-auto rounded-t-[24px] bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Order prompt"
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 mb-6" />
        <div className="px-6 pb-8 pt-0 relative">
          <button
            type="button"
            onClick={close}
            className="absolute top-0 right-6 p-1 rounded-full text-[#737373] hover:bg-[#f5f5f5] hover:text-[#171717] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-[22px] font-semibold text-[#171717] mb-1 pr-8">
            Ready to order?
          </h2>
          <p className="text-sm text-[#737373] mb-6">
            Place your order for healthy, high-protein meals.
          </p>
          <a
            href="https://wa.me/917042816413"
            onClick={close}
            className="flex items-center justify-center gap-3 w-full py-4 px-5 bg-white text-[#02583f] hover:bg-white/90 rounded-xl font-medium text-lg transition-colors border border-[#e5e5e5]"
          >
            <Phone className="w-6 h-6 shrink-0" />
            Order Now
          </a>
          <button
            type="button"
            onClick={close}
            className="w-full mt-3 py-3 text-[#737373] text-sm font-medium hover:text-[#171717] transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </>
  );
}
