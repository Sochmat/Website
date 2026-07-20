import { Db, ObjectId } from "mongodb";

const USERS = "users";

/**
 * The uppercased first name, stripped to A–Z and capped, used as the human-
 * readable prefix of a referral code. Falls back to "USER" when the name has no
 * usable letters (empty, or all digits/punctuation).
 */
export function referralPrefix(name?: string): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  const letters = first.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 12);
  return letters || "USER";
}

/**
 * `<PREFIX><4 digits>`, e.g. "HARSH1042". The name prefix makes the code
 * recognisable to share; the 4-digit suffix keeps it short. Uniqueness is the
 * caller's job (retry against the unique index in getOrCreateReferralCode).
 */
export function randomReferralCode(
  name?: string,
  rand: () => number = Math.random,
): string {
  const suffix = String(Math.floor(rand() * 10000)).padStart(4, "0");
  return `${referralPrefix(name)}${suffix}`;
}

let indexReady: Promise<unknown> | null = null;
function ensureIndex(db: Db): Promise<unknown> {
  if (!indexReady) {
    indexReady = db
      .collection(USERS)
      .createIndex({ referralCode: 1 }, { unique: true, sparse: true })
      .catch(() => {
        indexReady = null; // allow a later retry if this attempt failed
      });
  }
  return indexReady;
}

/** The user's referral code, assigning a unique one on first use. */
export async function getOrCreateReferralCode(
  db: Db,
  userId: ObjectId,
): Promise<string> {
  const existing = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { referralCode: 1, name: 1 } });
  if (existing?.referralCode) return existing.referralCode;

  await ensureIndex(db);
  for (let attempt = 0; attempt < 8; attempt++) {
    // A fresh 4-digit suffix each attempt, so a collision retries with a new code.
    const code = randomReferralCode(existing?.name);
    try {
      const res = await db
        .collection(USERS)
        .updateOne(
          { _id: userId, referralCode: { $exists: false } },
          { $set: { referralCode: code, updatedAt: new Date() } },
        );
      if (res.matchedCount === 0) {
        // Set concurrently by another request; read it back.
        const now = await db
          .collection(USERS)
          .findOne({ _id: userId }, { projection: { referralCode: 1 } });
        if (now?.referralCode) return now.referralCode;
      } else {
        return code;
      }
    } catch (e) {
      // Duplicate code (unique index) — retry with a fresh one.
      if ((e as { code?: number }).code !== 11000) throw e;
    }
  }
  throw new Error("Could not allocate a referral code");
}

export async function findUserIdByReferralCode(
  db: Db,
  code: string,
): Promise<ObjectId | null> {
  const trimmed = String(code ?? "").trim().toUpperCase();
  if (!trimmed) return null;
  const user = await db
    .collection(USERS)
    .findOne({ referralCode: trimmed }, { projection: { _id: 1 } });
  return (user?._id as ObjectId) ?? null;
}
