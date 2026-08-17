"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { message } from "antd";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { REFERRAL_REWARD, REFERRAL_REWARD_MAX } from "@/lib/walletMath";
import Shimmer from "@/components/ui/Shimmer";

interface ReferralInfo {
  referralCode: string;
  shareUrl: string;
  walletBalance: number;
  referralCount: number;
  earned: number;
  /** ₹ the next successful referral pays, per the reward ladder. */
  nextReward: number;
}

// A wa.me click-to-chat link with the invite pre-filled. Deliberately carries no
// phone number, so WhatsApp opens its contact picker and the user chooses who to
// send to rather than us guessing.
//
// Intentionally emoji-free, matching the delivery-nudge copy in
// admin/subscription-plans: astral-plane characters can arrive as replacement
// boxes, so the message leans on wording and *bold* instead.
function buildWhatsAppLink(code: string, shareUrl: string): string {
  const text = [
    "Hey! I've been ordering from Sochmat — fresh, made-to-order meals.",
    `Use my code *${code}* and get 20% off your first order:`,
    shareUrl,
  ].join("\n\n");
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** The WhatsApp glyph — lucide dropped brand icons, so it is inlined. */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
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
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-100 bg-white px-4 py-3">
        <Link href="/" className="-ml-2 p-2 text-[#111]">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold text-[#111]">Refer &amp; Earn</h1>
      </header>

      <div className="space-y-4 p-4">
        {loading ? (
          <>
            <Shimmer rounded="rounded-xl" className="h-24" />
            <Shimmer rounded="rounded-xl" className="h-14" />
            <Shimmer rounded="rounded-xl" className="h-40" />
          </>
        ) : signedOut || !info ? (
          <button
            onClick={openLoginPopup}
            className="w-full rounded-xl bg-[#f56215] py-3 font-semibold text-white"
          >
            Log in to see your referral code
          </button>
        ) : (
          <>
            <p className="text-sm text-[#666]">
              Share your code. When a friend places their first order, you get
              wallet credit — used automatically on your next order. It starts
              at ₹{REFERRAL_REWARD} and grows ₹25 with every friend, up to ₹
              {REFERRAL_REWARD_MAX}.
            </p>

            <div className="rounded-2xl bg-[#fff3ec] p-4 text-sm text-[#111]">
              Your next referral earns{" "}
              <span className="font-semibold">₹{info.nextReward}</span>
              {info.nextReward < REFERRAL_REWARD_MAX && (
                <span className="text-[#666]">
                  {" "}
                  — the one after that, ₹{info.nextReward + 25}
                </span>
              )}
            </div>

            <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-500">Your referral code</div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xl tracking-widest text-[#111]">
                  {info.referralCode}
                </span>
                <button
                  className="rounded-lg bg-[#f56215] px-3 py-1.5 text-sm font-semibold text-white"
                  onClick={() => copy(info.referralCode)}
                >
                  Copy code
                </button>
              </div>
              {/* An anchor, not a button, so long-press and open-in-new-tab
                  behave as expected and it needs no JavaScript to work. */}
              <a
                href={buildWhatsAppLink(info.referralCode, info.shareUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2.5 text-sm font-semibold text-white"
              >
                <WhatsAppIcon />
                Share on WhatsApp
              </a>
              <button
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#111]"
                onClick={() => copy(info.shareUrl)}
              >
                Copy share link
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="text-lg font-semibold text-[#111]">
                  ₹{info.walletBalance}
                </div>
                <div className="text-xs text-gray-500">Wallet balance</div>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="text-lg font-semibold text-[#111]">
                  {info.referralCount}
                </div>
                <div className="text-xs text-gray-500">Friends joined</div>
              </div>
              <div className="rounded-2xl bg-white p-3 shadow-sm">
                <div className="text-lg font-semibold text-[#111]">
                  ₹{info.earned}
                </div>
                <div className="text-xs text-gray-500">Total earned</div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
