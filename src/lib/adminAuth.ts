// Admin/shop session handling.
//
// The session is a compact HMAC-signed token stored in an httpOnly cookie, so
// it is sent automatically with same-origin requests and is invisible to JS
// (no XSS exfiltration). Signing/verification uses Web Crypto only, so this
// module is safe to import from both Edge middleware and Node route handlers.

export type AdminRole = "admin" | "shop";

export const ADMIN_COOKIE = "admin_session";
// 12h sessions.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const encoder = new TextEncoder();

function sessionSecret(): string {
  // Prefer a dedicated secret; fall back to an existing server secret so auth
  // never silently degrades to an empty key if the env var is unset.
  const secret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error(
      "No session secret configured (set ADMIN_SESSION_SECRET).",
    );
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

interface SessionPayload {
  role: AdminRole;
  exp: number;
}

/** Create a signed session token for the given role. */
export async function signSession(role: AdminRole): Promise<string> {
  const payload: SessionPayload = { role, exp: Date.now() + SESSION_TTL_MS };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const sig = base64UrlEncode(await hmac(body));
  return `${body}.${sig}`;
}

/** Verify a session token; returns the payload or null if invalid/expired. */
export async function verifySession(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
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
    ) as SessionPayload;
    if (
      (payload.role !== "admin" && payload.role !== "shop") ||
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
