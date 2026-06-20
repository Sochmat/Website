import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Distributed rate limiting backed by Upstash Redis (HTTP REST, so it works on
 * both edge middleware and serverless route handlers, and is shared across
 * instances).
 *
 * If the Upstash env vars are not set, every limiter is `null` and the helpers
 * below fail OPEN — requests are allowed. This keeps the app fully functional
 * before Redis is provisioned, and a Redis outage can never block real orders.
 *
 * Required env vars:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

function makeLimiter(
  tokens: number,
  window: Duration,
  prefix: string,
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `rl:${prefix}`,
    analytics: false,
  });
}

/** Per-endpoint limiter tiers, tuned by how costly / abusable each route is. */
export const limiters = {
  /** OTP send — SMS/email cost + brute force. Very strict. */
  otpSend: makeLimiter(3, "10 m", "otp-send"),
  /** OTP verify, logins — credential / code guessing. */
  auth: makeLimiter(10, "10 m", "auth"),
  /** Order placement + payment endpoints. */
  order: makeLimiter(15, "1 m", "order"),
  /** Geocode lookups — external Google Maps API cost. */
  geocode: makeLimiter(30, "1 m", "geocode"),
  /** Lenient blanket limit applied to all /api requests in middleware. */
  global: makeLimiter(120, "1 m", "global"),
};

/** Best-effort client IP from common proxy headers; falls back to a constant. */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the caller may retry, when blocked. */
  retryAfter?: number;
}

/**
 * Consume one token from `limiter` for `identifier`. Fails OPEN when the
 * limiter is not configured or Redis errors, so it can never break the app.
 */
export async function enforce(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<RateLimitResult> {
  if (!limiter) return { ok: true };
  try {
    const { success, reset } = await limiter.limit(identifier);
    if (success) return { ok: true };
    return { ok: false, retryAfter: secondsUntil(reset) };
  } catch {
    return { ok: true };
  }
}

function secondsUntil(resetMs: number): number {
  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(retryAfter?: number): NextResponse {
  return NextResponse.json(
    { success: false, message: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
    },
  );
}

/**
 * Convenience for route handlers: enforce a limiter for the request's client
 * IP (optionally namespaced) and return a ready 429, or `null` if allowed.
 *
 *   const limited = await rateLimit(request, limiters.otpSend);
 *   if (limited) return limited;
 */
export async function rateLimit(
  req: Request,
  limiter: Ratelimit | null,
  extraKey?: string,
): Promise<NextResponse | null> {
  const id = extraKey
    ? `${getClientIp(req)}:${extraKey}`
    : getClientIp(req);
  const { ok, retryAfter } = await enforce(limiter, id);
  return ok ? null : tooManyRequests(retryAfter);
}
