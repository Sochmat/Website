// Customer session handling.
//
// Mirrors src/lib/adminAuth.ts: a compact HMAC-signed token in an httpOnly
// cookie. Web Crypto only, so this is safe to import from both Edge middleware
// and Node route handlers.
//
// This replaces `localStorage.userToken` — a base64 of `userId:timestamp` that
// was unsigned, forgeable, and never checked by any route. The subscription
// plan endpoints move money-equivalent state (meal credits), so they derive the
// caller's identity from this cookie and ignore any client-supplied `userId`.

export const CUSTOMER_COOKIE = "user_session";

// 30-day sessions. A plan's credits stay valid for 30 days, so anything shorter
// would log a customer out part-way through their own plan.
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function sessionSecret(): string {
  const secret =
    process.env.CUSTOMER_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET ||
    process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error("No session secret configured (set CUSTOMER_SESSION_SECRET).");
  }
  return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(sig);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface CustomerSession {
  userId: string;
  exp: number;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export async function signCustomerSession(userId: string): Promise<string> {
  if (!OBJECT_ID.test(userId)) {
    throw new Error("signCustomerSession expects a 24-hex ObjectId");
  }
  const payload: CustomerSession = { userId, exp: Date.now() + SESSION_TTL_MS };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = base64UrlEncode(await hmac(body));
  return `${body}.${sig}`;
}

/** Verify a session token; returns the payload, or null if invalid or expired. */
export async function verifyCustomerSession(
  token: string | undefined | null,
): Promise<CustomerSession | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  try {
    const expectedSig = await hmac(body);
    if (!constantTimeEqual(base64UrlDecode(providedSig), expectedSig)) {
      return null;
    }
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(body)),
    ) as CustomerSession;
    if (
      typeof payload.userId !== "string" ||
      !OBJECT_ID.test(payload.userId) ||
      typeof payload.exp !== "number" ||
      payload.exp < Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Cookie options shared by every route that sets or clears the session.
 *
 * `domain` matters: the customer logs in on the apex (sochmat.com) but the
 * scheduler lives on subscription.sochmat.com. Without a leading-dot domain the
 * session is invisible there and every plan request 401s. Leave COOKIE_DOMAIN
 * unset in local dev, where the host is plain `localhost`.
 */
export function customerCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
  };
}
