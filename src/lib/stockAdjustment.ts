// Stock-quantity parsing, shared by the raw-material and production-item
// stock endpoints. Pure logic — see stockAdjustment.test.ts.

export interface ParsedStockQty {
  value?: number;
  error?: string;
}

/**
 * Validate a stock quantity coming off the wire.
 *
 * Accepts a number or a numeric string ("1,000", " 12.5 "), rejects blanks,
 * junk and negatives. Zero is valid and meaningful — it is "we have none",
 * which is different from the field being absent ("never counted").
 */
export function parseStockQty(input: unknown): ParsedStockQty {
  let n: number;

  if (typeof input === "number") {
    n = input;
  } else if (typeof input === "string") {
    const cleaned = input.replace(/,/g, "").trim();
    if (!cleaned) return { error: "Quantity is required" };
    n = Number(cleaned);
  } else {
    return { error: "Quantity is required" };
  }

  if (!Number.isFinite(n)) return { error: "Quantity must be a number" };
  if (n < 0) return { error: "Quantity cannot be negative" };

  return { value: n };
}
