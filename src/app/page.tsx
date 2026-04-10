"use client";

import { useState } from "react";
import Image from "next/image";
import CartBar from "@/components/CartBar";
import ExpandableMenu from "@/components/ExpandableMenu";
import HeroCarousel from "@/components/HeroCarousel";
import CategoryTiles from "@/components/CategoryTiles";
import MealCards from "@/components/MealCards";
import LocationSelector from "@/components/LocationSelector";
import { useLocation } from "@/context/LocationContext";

export default function Home() {
  const { location, isServiceable } = useLocation();
  const [locationOpen, setLocationOpen] = useState(false);

  const marqueeItems = [
    "High Protein",
    "NO Added Sugar",
    "Natural Ingredients",
    "High Protein",
    "NO Added Sugar",
    "Natural Ingredients",
  ];

  return (
    <main className="min-h-screen bg-white max-w-[430px] mx-auto overflow-hidden relative">
      {/* Header */}
      <div className="flex justify-between items-center gap-2 mt-[20px] px-4">
        <Image src="/logo.svg" alt="Logo" width={270} height={80} priority />
        <ExpandableMenu />
      </div>

      {/* Location Trigger */}
      <button
        type="button"
        onClick={() => setLocationOpen(true)}
        className="mx-4 mt-4 w-[calc(100%-32px)] flex items-center gap-2 border border-[#595959] rounded-[50px] px-4 py-2.5 text-left cursor-pointer hover:border-[#02583f] transition-colors"
      >
        <svg
          className="w-4 h-4 text-[#595959] shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="text-[#595959] text-sm flex-1 truncate">
          {location?.address ? location.address : "Select Location"}
        </span>
        {location && (
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isServiceable ? "bg-green-500" : "bg-red-500"
            }`}
          />
        )}
        <svg
          className="w-4 h-4 text-[#595959] shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      </button>

      {/* Location Selector */}
      <LocationSelector
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
      />

      {/* Hero Banner Carousel */}
      <HeroCarousel />
      {/* <div className="bg-[#f56215] py-4 overflow-hidden mt-2">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...marqueeItems, ...marqueeItems].map((item, index) => (
            <div key={index} className="flex items-center gap-2 mx-2">
              <span className="text-white font-semibold text-lg uppercase tracking-tight">
                {item}
              </span>
              <svg
                className="w-4 h-4 text-white rotate-45"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
          ))}
        </div>
      </div> */}

      {/* Also Available On */}
      {/* <div className="flex items-center justify-center gap-5 bg-white border border-[#d9d9d9] rounded-xl p-4 mx-4 mt-4 shadow-sm">
        <span className="text-black font-medium text-sm">
          Also available on
        </span>
        <div className="flex items-center gap-4">
          <Image
            src="/zomato.svg"
            alt="Zomato"
            width={46}
            height={46}
            className="h-12 w-auto"
            unoptimized
          />
          <div className="w-px h-10 bg-gray-200" />
          <Image
            src="/swiggy.svg"
            alt="Swiggy"
            width={46}
            height={46}
            className="h-12 w-12 rounded-lg object-contain"
            unoptimized
          />
        </div>
      </div> */}
      {/* Marquee */}

      {/* Category Tiles */}
      <CategoryTiles />

      {/* Meal Cards */}
      <MealCards />

      {/* Core Values Section */}
      {/* <CoreValues /> */}

      {/* Footer */}
      <footer className="bg-[#f56215] px-5 py-16">
        <Image
          src="/bottomLogo.svg"
          alt="Logo"
          width={150}
          height={20}
          priority
          className="mx-auto mb-4"
        />

        <div className="flex flex-col items-center gap-2 text-white font-semibold mb-8">
          <a href="#" className="hover:underline">
            Terms & Conditions
          </a>
          <a href="#" className="hover:underline">
            Privacy Policy
          </a>
        </div>

        <div className="flex flex-col items-center gap-4">
          <p
            className="text-white text-xl uppercase tracking-wider text-center"
            style={{ fontFamily: "Squada One, sans-serif" }}
          >
            Follow The Healthy!
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-white">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a href="#" className="text-white">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a href="#" className="text-white">
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>

      <CartBar />
    </main>
  );
}
