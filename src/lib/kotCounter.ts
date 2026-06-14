import { Db } from "mongodb";

/**
 * Returns the day key (YYYY-MM-DD) used to scope the daily KOT sequence.
 * Uses Asia/Kolkata so the counter resets at local midnight for the shop.
 */
export function kotDayKey(date: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/**
 * Atomically allocates the next KOT number for the given day. The sequence
 * resets each day (a new counter document is created via upsert).
 */
export async function nextKotNumber(
  db: Db,
  day: string = kotDayKey()
): Promise<number> {
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: `kot:${day}` as unknown as object },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const seq = (result as { seq?: number } | null)?.seq;
  return typeof seq === "number" ? seq : 1;
}

/**
 * Atomically allocates the next global bill number. Unlike the KOT sequence
 * this never resets — it is an ever-increasing running counter across all days.
 */
export async function nextBillNumber(db: Db): Promise<number> {
  const result = await db.collection("counters").findOneAndUpdate(
    { _id: "bill:global" as unknown as object },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  const seq = (result as { seq?: number } | null)?.seq;
  return typeof seq === "number" ? seq : 1;
}
