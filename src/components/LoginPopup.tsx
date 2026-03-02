"use client";

import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";

type AuthMode = "login" | "register";
type AuthStep = "details" | "otp";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export default function LoginPopup() {
  const { isOpen, closeLoginPopup } = useLoginPopup();
  const { setUser } = useUser();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<AuthStep>("details");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (resendTimer > 0) {
      const t = setTimeout(() => setResendTimer((r) => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendTimer]);

  useEffect(() => {
    if (!isOpen) {
      setMode("login");
      setStep("details");
      setName("");
      setEmail("");
      setOtp("");
      setError("");
      setLoading(false);
      setGoogleLoading(false);
    }
  }, [isOpen]);

  const persistSession = (data: { token: string; user: unknown }) => {
    localStorage.setItem("userToken", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user as never);
    closeLoginPopup();
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const endpoint = mode === "register" ? "/api/users/otp/register" : "/api/users/otp/send";
      const payload =
        mode === "register"
          ? { email: email.trim().toLowerCase(), name: name.trim() }
          : { email: email.trim().toLowerCase() };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });
      const data = await res.json();
      if (data.success) {
        persistSession({ token: data.token, user: data.user });
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
      const endpoint = mode === "register" ? "/api/users/otp/register" : "/api/users/otp/send";
      const payload =
        mode === "register"
          ? { email: email.trim().toLowerCase(), name: name.trim() }
          : { email: email.trim().toLowerCase() };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const ensureGoogleScript = async () => {
    if (window.google?.accounts?.id) return;

    await new Promise<void>((resolve, reject) => {
      const existing = document.getElementById("google-identity-script") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Google script failed to load")), {
          once: true,
        });
        return;
      }

      const script = document.createElement("script");
      script.id = "google-identity-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Google script failed to load"));
      document.head.appendChild(script);
    });
  };

  const handleGoogleLogin = async () => {
    if (!googleClientId) {
      setError("Google login is not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID.");
      return;
    }

    setError("");
    setGoogleLoading(true);

    try {
      await ensureGoogleScript();

      if (!window.google?.accounts?.id) {
        setError("Google login is unavailable right now.");
        setGoogleLoading(false);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: { credential?: string }) => {
          const credential = response.credential;
          if (!credential) {
            setError("Google login failed. Please try again.");
            setGoogleLoading(false);
            return;
          }

          try {
            const res = await fetch("/api/users/google", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ credential }),
            });
            const data = await res.json();

            if (data.success) {
              persistSession({ token: data.token, user: data.user });
            } else {
              setError(data.message || "Google login failed");
            }
          } catch {
            setError("Google login failed. Please try again.");
          } finally {
            setGoogleLoading(false);
          }
        },
      });

      window.google.accounts.id.prompt();
    } catch {
      setError("Unable to load Google login. Please try again.");
      setGoogleLoading(false);
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
        aria-label={mode === "login" ? "Login" : "Register"}
      >
        <div className="w-12 h-1 bg-[#e5e5e5] rounded-full mx-auto mt-3 mb-6" />
        <div className="px-6 pb-8 pt-0">
          <h2 className="text-[22px] font-semibold text-[#171717] mb-1">
            {mode === "login" ? "Login" : "Register"}
          </h2>
          <p className="text-sm text-[#737373] mb-6">
            {step === "details"
              ? mode === "login"
                ? "Enter your email to receive OTP"
                : "Enter your name and email to create account"
              : "Enter the 6-digit OTP sent to your email"}
          </p>

          {step === "details" ? (
            <form onSubmit={handleSendOTP} className="space-y-4">
              {mode === "register" && (
                <div>
                  <label htmlFor="login-popup-name" className="sr-only">
                    Name
                  </label>
                  <input
                    id="login-popup-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                    required
                  />
                </div>
              )}
              <div>
                <label htmlFor="login-popup-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="login-popup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                  required
                />
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={loading || googleLoading}
                className="w-full py-3.5 rounded-xl bg-[var(--primary-green)] text-white font-semibold hover:bg-[#034030] disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending..." : "Send OTP"}
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
                disabled={loading || googleLoading}
                className="w-full py-3.5 rounded-xl bg-[var(--primary-green)] text-white font-semibold hover:bg-[#034030] disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setStep("details");
                    setOtp("");
                    setError("");
                  }}
                  className="text-[var(--primary-green)] font-semibold"
                >
                  Change details
                </button>
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={resendTimer > 0 || loading || googleLoading}
                  className="text-[var(--primary-green)] font-semibold disabled:opacity-50"
                >
                  {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                </button>
              </div>
            </form>
          )}

          {step === "details" && (
            <>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#e5e5e5]" />
                <span className="text-xs text-[#737373] uppercase tracking-wide">or</span>
                <div className="h-px flex-1 bg-[#e5e5e5]" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading || googleLoading}
                className="w-full py-3.5 rounded-xl border border-[#e5e5e5] text-[#171717] font-semibold hover:bg-[#fafafa] disabled:opacity-50 transition-colors"
              >
                {googleLoading ? "Opening Google..." : "Continue with Google"}
              </button>

              <p className="mt-6 text-center text-sm text-[#737373]">
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                <button
                  type="button"
                  className="text-[var(--primary-green)] font-semibold"
                  onClick={() => {
                    setMode((m) => (m === "login" ? "register" : "login"));
                    setStep("details");
                    setName("");
                    setEmail("");
                    setOtp("");
                    setError("");
                  }}
                >
                  {mode === "login" ? "Register" : "Login"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
