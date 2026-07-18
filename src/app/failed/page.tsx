"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { XCircle } from "lucide-react";
import { Order } from "@/lib/types";

const SUPPORT_PHONE = "+91 7042816413";

function FailedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("orderId");
  const reason = searchParams.get("reason");
  const [order, setOrder] = useState<Order | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    fetch(`/api/orders?_id=${orderId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data?.success && data.order) {
          setOrder(data.order as Order);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // If the payment actually went through, send them to the tracking page.
  useEffect(() => {
    if (order && order.paymentStatus === "paid") {
      router.replace(`/success?orderId=${orderId}`);
    }
  }, [order, orderId, router]);

  const orderLabel =
    order?.orderNumber ??
    (orderId ? `#${String(orderId).slice(-6)}` : null);

  return (
    <main className="min-h-screen bg-[#f6f6f6] max-w-[430px] mx-auto pb-10">
      <div className="bg-white border-b border-[#d9d9d9] flex items-center gap-2 px-4 py-4">
        <Link href="/" className="p-1">
          <svg
            className="w-6 h-6 text-[#111]"
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
        <span className="text-[#111] text-lg font-semibold">Payment</span>
      </div>

      <div className="px-4 pt-12 flex flex-col items-center">
        <div className="w-20 h-20 rounded-full bg-[#fde8e8] flex items-center justify-center mb-5">
          <XCircle className="w-12 h-12 text-[#d84545]" />
        </div>

        <h1 className="text-xl font-semibold text-black text-center">
          Payment Failed
        </h1>
        <p className="text-sm text-[#737373] text-center mt-2 px-4 leading-relaxed">
          We couldn&apos;t process your payment
          {reason ? ` (${reason})` : ""}. If any amount was debited, it will be
          refunded automatically within a few days.
        </p>

        {orderLabel && (
          <p className="text-sm font-medium text-[#111] text-center mt-4">
            Order ID : {orderLabel}
          </p>
        )}

        <div className="w-full px-2 mt-10 space-y-3">
          <Link
            href="/order"
            className="block w-full bg-[#f56215] text-white text-center py-3 rounded-lg font-semibold"
          >
            Retry Payment
          </Link>
          <Link
            href="/"
            className="block w-full bg-[#1c1c1c] text-white text-center py-3 rounded-lg font-semibold"
          >
            Back to Home
          </Link>
        </div>

        <p className="text-xs text-[#999] text-center mt-8 px-6">
          Facing issues? Call{" "}
          <a
            href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
            className="text-[#f56215] font-medium"
          >
            {SUPPORT_PHONE}
          </a>
        </p>
      </div>
    </main>
  );
}

export default function FailedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#f6f6f6] max-w-[430px] mx-auto flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </main>
      }
    >
      <FailedContent />
    </Suspense>
  );
}
