"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { message } from "antd";
import { useLoginPopup } from "@/context/LoginPopupContext";

interface ReferralInfo {
  referralCode: string;
  shareUrl: string;
  walletBalance: number;
  referralCount: number;
  earned: number;
}

export default function ReferPage() {
  const { openLoginPopup } = useLoginPopup();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    fetch("/api/referral/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setInfo(d);
        else {
          setSignedOut(true);
          message.error(d.message ?? "Please sign in to see your referral code");
        }
      })
      .catch(() => message.error("Failed to load referral info"))
      .finally(() => setLoading(false));
  }, []);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success("Copied");
    } catch {
      message.error("Could not copy");
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f5f5] max-w-[430px] mx-auto pb-10">
      <header className="sticky top-16 z-10 bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-2">
        <Link href="/subscription" className="p-2 -ml-2 text-[#111]">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold text-[#111]">Refer &amp; Earn</h1>
      </header>

      <div className="p-4 space-y-4">
        {loading ? (
          <p className="text-gray-500 text-sm">Loading…</p>
        ) : signedOut || !info ? (
          <button
            onClick={openLoginPopup}
            className="w-full bg-[#f56215] text-white font-semibold py-3 rounded-xl"
          >
            Log in to see your referral code
          </button>
        ) : (
          <>
            <p className="text-sm text-[#666]">
              Share your code. When a friend buys their first subscription, you get
              ₹200 in wallet credit — used automatically on your next plan.
            </p>

            <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
              <div className="text-xs text-gray-500">Your referral code</div>
              <div className="flex items-center justify-between">
                <span className="text-xl font-mono tracking-widest text-[#111]">
                  {info.referralCode}
                </span>
                <button
                  className="rounded-lg bg-[#f56215] px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => copy(info.referralCode)}
                >
                  Copy code
                </button>
              </div>
              <button
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#111]"
                onClick={() => copy(info.shareUrl)}
              >
                Copy share link
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="text-lg font-semibold text-[#111]">
                  ₹{info.walletBalance}
                </div>
                <div className="text-xs text-gray-500">Wallet balance</div>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="text-lg font-semibold text-[#111]">
                  {info.referralCount}
                </div>
                <div className="text-xs text-gray-500">Friends joined</div>
              </div>
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                <div className="text-lg font-semibold text-[#111]">₹{info.earned}</div>
                <div className="text-xs text-gray-500">Total earned</div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
