import type { Db } from "mongodb";

/**
 * A single step in a payment's life. One payment attempt produces several rows
 * (create-order → verify:signature → verify:capture → …), so a failure can be
 * pinpointed to the exact route + stage, with the error and the surrounding
 * numbers (amounts in paise, the Razorpay payment status, etc.).
 *
 * Collection: `paymentLogs`. Correlate rows for one attempt by `razorpayOrderId`
 * (present from create-order onward) or `orderId` (the internal order/plan id).
 */
export interface PaymentLogEntry {
  /** Which checkout produced this. */
  flow: "order" | "subscription" | "unknown";
  /** Short slug of the step, e.g. "signature-mismatch", "not-captured", "created". */
  stage: string;
  /** The route the step ran in, e.g. "/api/payment/verify-order". */
  route: string;
  outcome: "success" | "failure" | "info";
  /** One-line human summary shown first in the admin table. */
  message?: string;

  orderId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  userId?: string;

  /** All amounts in paise (Razorpay's unit), to compare like-for-like. */
  amountPaise?: number;
  expectedAmountPaise?: number;
  /** Razorpay payment status: created | authorized | captured | failed | refunded. */
  paymentStatus?: string;

  error?: string;
  errorCode?: string;
  /** Any extra context; kept small. */
  meta?: Record<string, unknown>;
}

const LOG_TTL_DAYS = 90;

let indexReady: Promise<void> | null = null;
function ensureIndexes(db: Db): Promise<void> {
  if (!indexReady) {
    indexReady = (async () => {
      // Auto-expire old rows so the collection can't grow unbounded.
      await db
        .collection("paymentLogs")
        .createIndex({ createdAt: 1 }, { expireAfterSeconds: LOG_TTL_DAYS * 86400 });
      await db.collection("paymentLogs").createIndex({ outcome: 1, createdAt: -1 });
      await db.collection("paymentLogs").createIndex({ razorpayOrderId: 1 });
      await db.collection("paymentLogs").createIndex({ orderId: 1 });
    })().catch((e) => {
      // Index creation must never block logging; retry on the next call.
      indexReady = null;
      console.error("paymentLogs index ensure failed:", e);
    });
  }
  return indexReady;
}

/** Truncate free-text so a hostile or huge value can't bloat a row. */
function clip(v: unknown, max = 500): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = typeof v === "string" ? v : String(v);
  return s.length > max ? s.slice(0, max) + "…" : s;
}

/**
 * Fire-and-forget. Writing a log must never throw into or slow down the payment
 * flow, so all errors are swallowed (and printed) here.
 */
export async function logPayment(db: Db, entry: PaymentLogEntry): Promise<void> {
  try {
    void ensureIndexes(db);
    await db.collection("paymentLogs").insertOne({
      ...entry,
      message: clip(entry.message),
      error: clip(entry.error),
      errorCode: clip(entry.errorCode, 120),
      createdAt: new Date(),
    });
  } catch (e) {
    console.error("paymentLog write failed:", e, entry.stage);
  }
}
