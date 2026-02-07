"use client";

import Image from "next/image";
import Link from "next/link";

const imgDelivery =
  "https://www.figma.com/api/mcp/asset/a5506fec-aaf3-4884-9aa6-625d4f483d7c";
const imgCheckCircle =
  "https://www.figma.com/api/mcp/asset/4e9fde89-ed69-4185-9a0b-7492c5665fd6";

interface TrackingStep {
  title: string;
  status: "completed" | "active" | "pending";
  icon: React.ReactNode;
}

export default function SuccessPage() {
  const trackingSteps: TrackingStep[] = [
    {
      title: "Order Placed",
      status: "completed",
      icon: (
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      title: "Preparing Order",
      status: "active",
      icon: (
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
          />
        </svg>
      ),
    },
    {
      title: "Out for Delivery",
      status: "pending",
      icon: (
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
          />
        </svg>
      ),
    },
    {
      title: "Arrived at Location",
      status: "pending",
      icon: (
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
    {
      title: "Delivered",
      status: "pending",
      icon: (
        <svg
          className="w-4 h-4 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      ),
    },
  ];

  const getStepBgColor = (status: TrackingStep["status"]) => {
    switch (status) {
      case "completed":
        return "bg-[#171717]";
      case "active":
        return "bg-[#171717]";
      case "pending":
        return "bg-[#f5f5f5]";
      default:
        return "bg-[#f5f5f5]";
    }
  };

  const getLineColor = (index: number) => {
    if (index < 2) return "border-[#171717]";
    return "border-dashed border-[#d4d4d4]";
  };

  return (
    <main className="min-h-screen bg-[#f6f6f6] max-w-[430px] mx-auto">
      <div className="px-2.5 pt-8 pb-10">
        {/* Success Card */}
        <div className="bg-white rounded-xl py-10 px-5 flex flex-col items-center gap-2">
          <div className="w-16 h-16 relative">
            <Image
              src={imgCheckCircle}
              alt="Success"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
          <h1 className="text-xl font-semibold text-black text-center">
            We have received your order!
          </h1>
          <p className="text-sm font-medium text-[#111] text-center">
            Order ID : #001
          </p>
        </div>

        {/* Tracking Card */}
        <div className="bg-white rounded-xl px-5 py-4 mt-5">
          {/* Arriving Info */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm text-[#555]">Arriving in</span>
              <span className="text-2xl font-bold text-[#f56215]">30 min</span>
            </div>
            <div className="w-20 h-[60px] relative">
              <Image
                src={imgDelivery}
                alt="Delivery"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-200 my-4" />

          {/* Tracking Steps */}
          <div className="flex flex-col gap-6 relative">
            {trackingSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-3 relative">
                {/* Connector Line */}
                {index < trackingSteps.length - 1 && (
                  <div
                    className={`absolute left-4 top-8 w-px h-6 ${
                      index < 2
                        ? "bg-[#171717]"
                        : "border-l border-dashed border-[#d4d4d4]"
                    }`}
                  />
                )}

                {/* Step Circle */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-[0px_0px_0px_8px_white] relative z-10 ${getStepBgColor(
                    step.status
                  )}`}
                >
                  {step.icon}
                </div>

                {/* Step Title */}
                <span className="text-sm font-semibold text-[#171717]">
                  {step.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16">
          <p className="text-base font-medium text-black">
            Follow us at -{" "}
            <Link href="https://instagram.com/sochmat" className="underline">
              @sochmat
            </Link>
          </p>
        </div>

        {/* Back to Home */}
        <div className="mt-8 px-4">
          <Link
            href="/"
            className="block w-full bg-[#02583f] text-white text-center py-3 rounded-lg font-semibold"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
