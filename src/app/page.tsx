"use client";

import Image from "next/image";
import Link from "next/link";
import CartBar from "@/components/CartBar";
import Menu from "@/components/Menu";
import ExpandableMenu from "@/components/ExpandableMenu";

const imgHeroFood =
  "https://www.figma.com/api/mcp/asset/b672fe8e-1927-4bea-b6a2-3f01ef15169a";
const imgZomato =
  "https://www.figma.com/api/mcp/asset/14a79d1d-09a6-43d9-9c8e-7f7d8dd02cc1";
const imgSwiggy =
  "https://www.figma.com/api/mcp/asset/73332e12-19a4-46fe-9819-8dbb9550c040";
const imgPhoneMockup =
  "https://www.figma.com/api/mcp/asset/679b98b1-16b2-48a2-820c-6eaf386f3be8";
const imgCoreValuesBg =
  "https://www.figma.com/api/mcp/asset/13a72c05-0e57-45af-979e-a58004f76dcb";
const imgHerbal =
  "https://www.figma.com/api/mcp/asset/89640f76-d76e-42f9-b774-4b18fdbb2ea5";
const imgCustomer =
  "https://www.figma.com/api/mcp/asset/fcedd705-e220-4e81-a4f0-ecc32a0815c9";
const imgBalance =
  "https://www.figma.com/api/mcp/asset/0423f774-5087-476c-b135-ab72c6d670b2";
const imgSugar =
  "https://www.figma.com/api/mcp/asset/e9eef07b-f208-4a0e-a7e3-38b70269b501";
const imgLogoLeft =
  "https://www.figma.com/api/mcp/asset/39fbd6f4-044c-428b-86b7-007fc4861fd4";
const imgLogoRight =
  "https://www.figma.com/api/mcp/asset/40be1ff8-9e89-4b24-aacf-fa31f35e8aef";

export default function Home() {
  const coreValues = [
    {
      icon: (
        <div className="w-7 h-7 bg-[#9eea01] rounded-full flex items-center justify-center">
          <svg
            className="w-4 h-4 text-[#02583f]"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
          </svg>
        </div>
      ),
      image: null,
      title: "High-Protein, Purpose-Driven Nutrition",
      description:
        "Food that provide meaningful protein that supports strength, recovery, and everyday energy.",
    },
    {
      icon: null,
      image: imgSugar,
      title: "No Added Sugar",
      description: "Sweetness comes naturally from real ingredients.",
    },
    {
      icon: null,
      image: imgHerbal,
      title: "Clean & Natural Ingredients",
      description:
        "Only simple, recognizable ingredients. No artificial colors, flavors, or unnecessary additives.",
    },
    {
      icon: null,
      image: imgCustomer,
      title: "Customer First Approach",
      description:
        "We listen, improve, and build our products around real customer needs, feedback, and lifestyles.",
    },
    {
      icon: null,
      image: imgBalance,
      title: "Balanced, Not Extreme",
      description:
        "Food that supports a sustainable, long-term healthy lifestyle, not crash diets or fads.",
    },
  ];

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
      {/* Logo */}
      <div className="flex justify-between items-center gap-2 mt-[20px] px-4">
        <div className="bg-[#02583f] rounded-[47.5px] w-[270px] h-[60px] flex items-center justify-center">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1">
              <Image
                src={imgLogoLeft}
                alt=""
                width={63}
                height={24}
                className="h-6 w-auto"
                unoptimized
              />
              <Image
                src={imgLogoRight}
                alt=""
                width={68}
                height={24}
                className="h-6 w-auto"
                unoptimized
              />
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="bg-white h-1 w-8 rounded-full" />
              <span className="text-white text-[8px] font-play uppercase tracking-widest">
                BY fITFUEL
              </span>
              <div className="bg-white h-1 w-8 rounded-full" />
            </div>
          </div>
        </div>
        <ExpandableMenu />
      </div>

      {/* Hero Image */}
      <div className="relative h-[520px] mt-[20px] mx-4 rounded-t-xl overflow-hidden z-0">
        <Image
          src={imgHeroFood}
          alt="Delicious food"
          fill
          className="object-cover"
        />
      </div>

      {/* Also Available On */}
      <div className="flex items-center justify-center gap-2 bg-white rounded-xl p-[16px] mx-auto -mt-32 relative z-10 shadow-sm w-fit">
        <span className="text-black font-medium">Also available on</span>
        <div className="flex items-center gap-4">
          <Image
            src={imgZomato}
            alt="Zomato"
            width={46}
            height={56}
            className="h-14 w-auto"
            unoptimized
          />
          <div className="w-px h-10 bg-gray-300" />
          <Image
            src={imgSwiggy}
            alt="Swiggy"
            width={56}
            height={56}
            className="h-14 w-14 rounded-lg object-cover"
            unoptimized
          />
        </div>
      </div>

      {/* Marquee */}
      <div className="bg-[#f56215] py-4 overflow-hidden z-10 absolute w-full mt-6 ">
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
      </div>

      {/* Menu Section */}
      <div className="px-4 pt-16 pb-6 mt-4">
        <Menu
          showTitle={true}
          linkCategoriesToMenu={true}
          showOnHomePage={true}
        />
      </div>

      {/* Core Values Section */}
      <div className="relative bg-[#02583f] min-h-[700px]">
        <div className="absolute inset-0 mix-blend-multiply opacity-30">
          <Image
            src={imgCoreValuesBg}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
        </div>
        <div className="relative z-10 px-5 py-16">
          <h2 className="text-white text-5xl text-center font-bold uppercase tracking-wider mb-12">
            CORE VALUES
          </h2>
          <div className="flex flex-col gap-6">
            {coreValues.map((value, index) => (
              <div key={index} className="flex gap-3">
                {value.icon ? (
                  value.icon
                ) : (
                  <div className="w-7 h-7 shrink-0">
                    <Image
                      src={value.image!}
                      alt=""
                      width={28}
                      height={28}
                      className="object-contain"
                      unoptimized
                    />
                  </div>
                )}
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-[#9eea01] text-base">{value.title}</h3>
                  <p className="text-white text-sm font-light leading-5">
                    {value.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Download App Section */}
      {/* <div className="mx-5 my-8">
        <div className="bg-[#02583f] rounded-[32px] px-6 py-16 relative overflow-hidden">
          <h2 className="text-white text-4xl font-semibold text-center leading-tight mb-4">
            Order from our
            <br />
            App Now!
          </h2>
          <div className="flex flex-col gap-2 mb-4">
            <div className="flex items-center justify-center gap-1.5">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-white text-xl">
                Personalised Diet Tracking
              </span>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-white text-xl">Exciting Discounts</span>
            </div>
          </div>

          <div className="flex flex-col gap-4 items-center">
            <button className="bg-white px-5 py-2.5 rounded-full shadow-md flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#f56215">
                <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.61 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
              </svg>
              <span className="text-[#f56215] text-sm font-medium">
                Download on Google Play
              </span>
            </button>
            <button className="bg-white px-5 py-2.5 rounded-full shadow-md flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#f56215">
                <path d="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z" />
              </svg>
              <span className="text-[#f56215] text-sm font-medium">
                Download on App Store
              </span>
            </button>
          </div>

          Phone Mockup
          <div className="mt-8 flex justify-center">
            <div className="relative w-[284px] h-[351px]">
              <div className="absolute inset-0 bg-black rounded-[42px] border-4 border-[#989892] overflow-hidden">
                <Image
                  src={imgPhoneMockup}
                  alt="App Preview"
                  fill
                  className="object-cover rounded-[38px]"
                  unoptimized
                />
              </div>
            </div>
          </div>
        </div>
      </div> */}

      {/* Footer */}
      <footer className="bg-[#f56215] px-5 py-16">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="flex items-center gap-1.5">
            <Image
              src={imgLogoLeft}
              alt=""
              width={95}
              height={36}
              className="h-9 w-auto brightness-0 invert"
              unoptimized
            />
            <Image
              src={imgLogoRight}
              alt=""
              width={102}
              height={36}
              className="h-9 w-auto brightness-0 invert"
              unoptimized
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-white h-1.5 w-12 rounded-full" />
            <span className="text-white text-xs font-play uppercase tracking-wider">
              BY fITFUEL
            </span>
            <div className="bg-white h-1.5 w-12 rounded-full" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 text-white font-semibold mb-8">
          <a href="#" className="hover:underline">
            Terms & Conditions
          </a>
          <a href="#" className="hover:underline">
            Privacy Policy
          </a>
        </div>

        <div className="flex flex-col items-center gap-4">
          <p className="text-white text-xl font-squada uppercase tracking-wider text-center">
            Follow The Healthy!
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-white">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a href="#" className="text-white">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            <a href="#" className="text-white">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
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
