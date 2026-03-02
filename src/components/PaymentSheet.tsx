"use client";

import type { UpiApp } from "@/helpers/razorpay";

const UPI_APPS = [
  { id: "google_pay" as UpiApp, name: "Google Pay", color: "#4285F4", initials: "G" },
  { id: "phonepe" as UpiApp, name: "PhonePe", color: "#5f259f", initials: "Pe" },
  { id: "paytm" as UpiApp, name: "Paytm", color: "#00BAF2", initials: "Pt" },
  { id: "bhim" as UpiApp, name: "BHIM", color: "#00796b", initials: "B" },
];

interface PaymentSheetProps {
  open: boolean;
  selectedUpiApp: UpiApp | null;
  paymentMethod: "cash" | "razorpay";
  onSelectUpi: (app: UpiApp) => void;
  onSelectCod: () => void;
  onClose: () => void;
}

export default function PaymentSheet({
  open,
  selectedUpiApp,
  paymentMethod,
  onSelectUpi,
  onSelectCod,
  onClose,
}: PaymentSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[430px] bg-white rounded-t-2xl p-5 pb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-[#111]">
            Choose Payment Method
          </h3>
          <button type="button" onClick={onClose} className="p-1">
            <svg className="w-5 h-5 text-[#666]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-[#666] mb-3">Pay via UPI</p>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {UPI_APPS.map((app) => {
            const isSelected = paymentMethod === "razorpay" && selectedUpiApp === app.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onSelectUpi(app.id)}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors ${
                  isSelected
                    ? "border-[#f56215] bg-[#fff7f3]"
                    : "border-[#e5e5e5] bg-white"
                }`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: app.color }}
                >
                  <span className="text-white text-sm font-bold">{app.initials}</span>
                </div>
                <span className="text-xs text-[#333] font-medium leading-tight text-center">
                  {app.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-t border-[#e5e5e5] pt-4">
          <button
            type="button"
            onClick={onSelectCod}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors ${
              paymentMethod === "cash"
                ? "border-[#f56215] bg-[#fff7f3]"
                : "border-[#e5e5e5] bg-white"
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-[#e8f5e9] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#2e7d32]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-semibold text-[#111]">Cash on Delivery</p>
              <p className="text-xs text-[#666]">Pay when your order arrives</p>
            </div>
            {paymentMethod === "cash" && (
              <svg className="w-5 h-5 text-[#f56215]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
