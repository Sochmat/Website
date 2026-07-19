import { Db, ObjectId } from "mongodb";

const USERS = "users";
// No 0/O/1/I to keep shared codes unambiguous.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomReferralCode(rand: () => number = Math.random): string {
  let code = "SM";
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  }
  return code;
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
    .findOne({ _id: userId }, { projection: { referralCode: 1 } });
  if (existing?.referralCode) return existing.referralCode;

  await ensureIndex(db);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomReferralCode();
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
