/**
 * How an order's money splits between the bill and what was actually charged.
 *
 * `totalAmount` is the GROSS bill (items − discounts + tax); wallet credit and
 * reward points are then spent against it, and only the remainder reaches
 * Razorpay as `netAmount`. Admin screens that show `totalAmount` alone read as
 * a mismatch against the payment log — the gap is the redemption, not a drift.
 *
 * Pure and client-safe (no DB), so the admin table and any report derive the
 * split the same way.
 */

/** The raw amount fields as they appear on an order document. */
export interface OrderAmountFields {
  totalAmount?: unknown;
  netAmount?: unknown;
  amountPayable?: unknown;
  walletApplied?: unknown;
  pointsApplied?: unknown;
}

export interface OrderAmounts {
  /** Gross bill including tax, before any balance was spent. */
  total: number;
  /** What the customer was actually charged — matches the payment log. */
  paid: number;
  walletApplied: number;
  pointsApplied: number;
  /** True when a balance covered part of the bill, so the two differ. */
  hasRedemption: boolean;
}

/**
 * A finite number, or null when the field is absent or unusable. Note that
 * `Number(null)` and `Number("")` are 0, not NaN — so a stored `netAmount: null`
 * would otherwise read as a genuine ₹0 charge and hide the real one.
 */
function money(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Non-negative amount, defaulting junk and absences to 0. */
function amount(value: unknown): number {
  return Math.max(0, money(value) ?? 0);
}

/**
 * Aggregation twins of the fields below, for reports that must not load every
 * order into memory to add them up. Keep these in step with `orderAmounts`:
 * they encode the SAME rule, expressed for the server.
 *
 * `$ifNull` takes a fallback chain (MongoDB 5.0+) and treats a stored null the
 * same as an absent field, which matches `money()` above.
 */
export const MONGO_GROSS_AMOUNT = { $ifNull: ["$totalAmount", 0] } as const;

export const MONGO_REDEEMED_AMOUNT = {
  $add: [{ $ifNull: ["$walletApplied", 0] }, { $ifNull: ["$pointsApplied", 0] }],
} as const;

export const MONGO_COLLECTED_AMOUNT = {
  $max: [
    0,
    {
      $ifNull: [
        "$netAmount",
        "$amountPayable",
        { $subtract: [MONGO_GROSS_AMOUNT, MONGO_REDEEMED_AMOUNT] },
      ],
    },
  ],
} as const;

export function orderAmounts(order: OrderAmountFields): OrderAmounts {
  const total = amount(order.totalAmount);
  const walletApplied = amount(order.walletApplied);
  const pointsApplied = amount(order.pointsApplied);

  // netAmount is what reconcile verifies against Razorpay, so it wins.
  // amountPayable is its twin, written in the same update. Orders that predate
  // redemption have neither, and no balances either — so the bill IS the charge.
  const stored = money(order.netAmount) ?? money(order.amountPayable);
  const paid = Math.max(
    0,
    stored ?? total - walletApplied - pointsApplied,
  );

  return {
    total,
    paid,
    walletApplied,
    pointsApplied,
    hasRedemption: walletApplied > 0 || pointsApplied > 0,
  };
}
