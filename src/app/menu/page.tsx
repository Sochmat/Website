"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Menu from "@/components/Menu";
import CartBar from "@/components/CartBar";

export default function MenuPage() {
  const searchParams = useSearchParams();
  const category = searchParams.get("category");

  return (
    <main className="min-h-screen bg-white max-w-[430px] mx-auto pb-32">
      <div className="px-4 pt-8 pb-4">
        <Menu 
          showTitle={true} 
          linkCategoriesToMenu={false}
          initialCategory={category === "beverages" ? "beverages" : "food"}
        />
      </div>

      <CartBar />

      <Link
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
      </Link>
    </main>
  );
}
