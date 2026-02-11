"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";

export default function LoginPopup() {
  const { isOpen, closeLoginPopup } = useLoginPopup();
  const { setUser } = useUser();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer((r) => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  useEffect(() => {
    if (!isOpen) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setError("");
    }
  }, [isOpen]);

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/users/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        setStep("otp");
        setResendTimer(60);
      } else {
        setError(data.message || "Failed to send OTP");
      }
    } catch {
      setError("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/users/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, otp }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("userToken", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        setUser(data.user);
        closeLoginPopup();
      } else {
        setError(data.message || "Invalid OTP");
      }
    } catch {
      setError("Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendTimer > 0) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/users/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        setResendTimer(60);
        setOtp("");
      } else {
        setError(data.message || "Failed to resend OTP");
      }
    } catch {
      setError("Failed to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/40 transition-opacity"
        onClick={closeLoginPopup}
        aria-hidden
      />
      <div
        className="fixed left-0 right-0 bottom-0 z-[201] max-w-[430px] mx-auto rounded-t-[24px] bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.12)] animate-slide-up"
        role="dialog"
        aria-modal="true"
        aria-label="Login"
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 mb-6" />
        <div className="px-6 pb-8 pt-0">
          <h2 className="text-[22px] font-semibold text-[#171717] mb-1">Login</h2>
          <p className="text-sm text-[#737373] mb-6">
            {step === "phone"
              ? "Enter your phone number to receive OTP"
              : "Enter the 6-digit OTP sent to your phone"}
          </p>

          {step === "phone" ? (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <div>
                <label htmlFor="login-popup-phone" className="sr-only">
                  Phone number
                </label>
                <input
                  id="login-popup-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-[var(--primary-green)] text-white font-semibold hover:bg-[#034030] disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending…" : "Send OTP"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div>
                <label htmlFor="login-popup-otp" className="sr-only">
                  OTP
                </label>
                <input
                  id="login-popup-otp"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Enter OTP"
                  maxLength={6}
                  className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] text-[#171717] placeholder:text-[#a3a3a3] text-center text-xl tracking-[0.2em] focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 rounded-xl bg-[var(--primary-green)] text-white font-semibold hover:bg-[#034030] disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying…" : "Verify OTP"}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("phone");
                    setOtp("");
                    setError("");
                  }}
                  className="text-[var(--primary-green)] font-semibold"
                >
                  Change number
                </button>
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={resendTimer > 0 || loading}
                  className="text-[var(--primary-green)] font-semibold disabled:opacity-50"
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                </button>
              </div>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-[#737373]">
            Don’t have an account?{" "}
            <a href="/register" className="text-[var(--primary-green)] font-semibold" onClick={closeLoginPopup}>
              Register
            </a>
          </p>
        </div>
      </div>
    </>
  );
}
