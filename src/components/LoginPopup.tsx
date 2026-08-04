"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";

type AuthMode = "login" | "register";
/** "phone" is only reached after Google sign-in, which never gives us a number. */
type AuthStep = "details" | "otp" | "phone";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "small" | "medium" | "large";
              type?: "standard" | "icon";
              shape?: "rectangular" | "pill" | "circle" | "square";
              text?: "signin_with" | "signup_with" | "continue_with";
              logo_alignment?: "left" | "center";
              width?: number;
            },
          ) => void;
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
  const [phone, setPhone] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<AuthStep>("details");
  // Held while the Google-signed-in user supplies their number. The cookie is
  // already set at this point; this is only the payload for local state.
  const [pendingSession, setPendingSession] = useState<{
    token: string;
    user: unknown;
  } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [googleReady, setGoogleReady] = useState(true);
  /** Only a brand-new account can still be attributed to a referrer. */
  const [googleIsNewUser, setGoogleIsNewUser] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Auto-focus the OTP field the moment the verify step appears.
  useEffect(() => {
    if (isOpen && step === "otp") otpInputRef.current?.focus();
  }, [isOpen, step]);

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
      setPhone("");
      setReferralCode("");
      setOtp("");
      setError("");
      setLoading(false);
      setGoogleLoading(false);
      setGoogleReady(true);
      setGoogleIsNewUser(false);
      setPendingSession(null);
    } else {
      // Prefill the referral box from a `?ref=` link the user arrived through.
      try {
        const captured = localStorage.getItem("sochmat_ref");
        if (captured) setReferralCode(captured);
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

  /** Typed code wins; otherwise a code captured from a `?ref=` link. */
  const capturedRef = (): string | undefined =>
    referralCode.trim().toUpperCase() ||
    localStorage.getItem("sochmat_ref") ||
    undefined;

  // The httpOnly session cookie set by the verify response is the credential;
  // this only seeds the in-memory user so the UI updates without a round trip.
  const persistSession = (data: { token: string; user: unknown }) => {
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
          ? {
              email: email.trim().toLowerCase(),
              name: name.trim(),
              phone,
              ref: capturedRef(),
            }
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

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/users/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only a brand-new account may be attributed. Sending this
        // unconditionally would let a stale `?ref=` code in localStorage
        // attach itself to an existing account that simply lacked a phone.
        body: JSON.stringify({
          phone,
          ref: googleIsNewUser ? capturedRef() : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        persistSession({
          token: pendingSession?.token ?? "",
          user: data.user,
        });
      } else {
        setError(data.message || "Could not save that number");
      }
    } catch {
      setError("Could not save that number. Please try again.");
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
          ? {
              email: email.trim().toLowerCase(),
              name: name.trim(),
              phone,
              ref: capturedRef(),
            }
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
      // A tag that already finished loading fires neither event again, so this
      // would wait forever if GSI loaded but never defined window.google —
      // leaving the caller with no button and no error to show.
      const timeout = setTimeout(
        () => reject(new Error("Google script timed out")),
        10000,
      );
      const settle = (fn: () => void) => () => {
        clearTimeout(timeout);
        fn();
      };

      const existing = document.getElementById("google-identity-script") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", settle(resolve), { once: true });
        existing.addEventListener(
          "error",
          settle(() => reject(new Error("Google script failed to load"))),
          { once: true },
        );
        return;
      }

      const script = document.createElement("script");
      script.id = "google-identity-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = settle(resolve);
      script.onerror = settle(() =>
        reject(new Error("Google script failed to load")),
      );
      document.head.appendChild(script);
    });
  };

  const handleGoogleCredential = async (response: { credential?: string }) => {
    const credential = response.credential;
    if (!credential) {
      setError("Google login failed. Please try again.");
      return;
    }

    setError("");
    setGoogleLoading(true);
    try {
      const res = await fetch("/api/users/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // A code captured from a `?ref=` link attributes the signup without the
        // user typing anything; the phone step below collects one otherwise.
        body: JSON.stringify({ credential, ref: capturedRef() }),
      });
      const data = await res.json();

      if (data.success && data.needsPhone) {
        // Signed in, but Google gave us no number. The cookie is already
        // set — collect the phone before handing over the UI.
        setPendingSession({ token: data.token, user: data.user });
        setGoogleIsNewUser(Boolean(data.isNewUser));
        setStep("phone");
        setError("");
      } else if (data.success) {
        persistSession({ token: data.token, user: data.user });
      } else {
        setError(data.message || "Google login failed");
      }
    } catch {
      setError("Google login failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  // Read through a ref so the render effect below never needs to re-run (and
  // re-mount the button) just because this component re-rendered.
  const onCredential = useRef(handleGoogleCredential);
  useEffect(() => {
    onCredential.current = handleGoogleCredential;
  });

  // Google's own rendered button, rather than One Tap's prompt().
  //
  // Since Chrome moved GSI onto FedCM, prompt() is silently suppressed for
  // hours after a few dismissals — and it reports that through no callback we
  // subscribe to, so the click simply did nothing. renderButton is not subject
  // to that cooldown and gives the user something visible to press.
  useEffect(() => {
    if (!isOpen || step !== "details" || !googleClientId) return;
    let cancelled = false;

    (async () => {
      try {
        await ensureGoogleScript();
        const container = googleButtonRef.current;
        if (cancelled || !container || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => onCredential.current(response),
        });
        container.innerHTML = ""; // drop a button left by a previous render
        window.google.accounts.id.renderButton(container, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: container.offsetWidth || 320,
        });
        if (!cancelled) setGoogleReady(true);
      } catch {
        if (!cancelled) setGoogleReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, step, googleClientId]);

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
            {step === "phone"
              ? "Almost there — add a phone number for delivery updates"
              : step === "details"
                ? mode === "login"
                  ? "Enter your email to receive OTP"
                  : "Enter your details to create account"
                : "Enter the 6-digit OTP sent to your email"}
          </p>

          {step === "phone" ? (
            <form onSubmit={handleSavePhone} className="space-y-4">
              <div>
                <label htmlFor="login-popup-google-phone" className="sr-only">
                  Phone number
                </label>
                <input
                  id="login-popup-google-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) =>
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="10-digit mobile number"
                  maxLength={10}
                  className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                  required
                />
                <p className="mt-2 text-xs text-[#737373]">
                  One account per number.
                </p>
              </div>
              {/* Only a brand-new account can still be attributed. An existing
                  phoneless account reaches this step too, and `referredBy`'s
                  set-once rule would silently discard anything it typed. */}
              {googleIsNewUser && (
                <div>
                  <label htmlFor="login-popup-google-ref" className="sr-only">
                    Referral code (optional)
                  </label>
                  <input
                    id="login-popup-google-ref"
                    type="text"
                    value={referralCode}
                    onChange={(e) =>
                      setReferralCode(e.target.value.toUpperCase())
                    }
                    placeholder="Referral code (optional)"
                    autoCapitalize="characters"
                    className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] uppercase tracking-wide text-[#171717] placeholder:text-[#a3a3a3] placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                  />
                </div>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading || phone.length !== 10}
                className="w-full py-3.5 rounded-xl bg-[var(--primary-green)] text-white font-semibold hover:bg-[#034030] disabled:opacity-50 transition-colors"
              >
                {loading ? "Saving..." : "Continue"}
              </button>
            </form>
          ) : step === "details" ? (
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
              {mode === "register" && (
                <div>
                  <label htmlFor="login-popup-phone" className="sr-only">
                    Phone number
                  </label>
                  <input
                    id="login-popup-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] text-[#171717] placeholder:text-[#a3a3a3] focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                    required
                  />
                </div>
              )}
              {mode === "register" && (
                <div>
                  <label htmlFor="login-popup-ref" className="sr-only">
                    Referral code (optional)
                  </label>
                  <input
                    id="login-popup-ref"
                    type="text"
                    value={referralCode}
                    onChange={(e) =>
                      setReferralCode(e.target.value.toUpperCase())
                    }
                    placeholder="Referral code (optional)"
                    autoCapitalize="characters"
                    className="w-full px-4 py-3.5 rounded-xl border border-[#e5e5e5] uppercase tracking-wide text-[#171717] placeholder:text-[#a3a3a3] placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-[var(--primary-green)] focus:border-transparent"
                  />
                </div>
              )}
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <button
                type="submit"
                disabled={
                  loading ||
                  googleLoading ||
                  (mode === "register" && phone.length !== 10)
                }
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
                  ref={otpInputRef}
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

              {/* Google renders its own button in here. */}
              <div className="flex justify-center min-h-[44px]">
                <div ref={googleButtonRef} />
              </div>
              {googleLoading && (
                <p className="mt-2 text-center text-sm text-[#737373]">
                  Signing you in...
                </p>
              )}
              {!googleReady && (
                <p className="mt-2 text-center text-sm text-[#737373]">
                  Google sign-in is unavailable right now. Use your email above.
                </p>
              )}

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
