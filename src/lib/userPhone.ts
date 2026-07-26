import { Db, ObjectId } from "mongodb";
import { hasPhone } from "./phone";

const USERS = "users";

/** Collections whose documents are keyed to a customer by `userId`. */
const USER_KEYED = [
  "orders",
  "subscriptions",
  "subscriptionMealPlans",
  "walletTransactions",
] as const;

let indexReady: Promise<unknown> | null = null;

/**
 * The unique index behind one-phone-per-account.
 *
 * The partial filter is what makes this deployable against live data: existing
 * documents with `phone: ""` or no phone field fall outside it, so creation
 * succeeds. A plain `unique: true` — even sparse — would fail on the pile of
 * `phone: ""` docs left by the old Google signup path.
 */
export function ensurePhoneIndex(db: Db): Promise<unknown> {
  if (!indexReady) {
    indexReady = db
      .collection(USERS)
      .createIndex(
        { phone: 1 },
        {
          unique: true,
          partialFilterExpression: { phone: { $type: "string", $gt: "" } },
        },
      )
      .catch((e) => {
        // Loudly: the most likely cause is duplicate phone values already in
        // the collection, and a silent failure would leave uniqueness enforced
        // only by the application checks — which do not cover the write race.
        console.error(
          "users.phone unique index could not be created; " +
            "resolve duplicate phone numbers and redeploy.",
          e,
        );
        indexReady = null; // allow a later retry if this attempt failed
      });
  }
  return indexReady;
}

/**
 * "claimed"   — the phone is now on the account
 * "unchanged" — the account already had a phone, or already had this one
 * "taken"     — another real account owns it; the caller should refuse
 */
export type PhoneClaimResult = "claimed" | "unchanged" | "taken";

/**
 * A phone-only document auto-created at checkout from a receiver's number. It
 * has never been logged into, so absorbing it steals nothing from anyone.
 */
function isShadow(doc: Record<string, unknown>): boolean {
  const email = typeof doc.email === "string" ? doc.email.trim() : "";
  const googleId = typeof doc.googleId === "string" ? doc.googleId.trim() : "";
  return !email && !googleId;
}

/**
 * Drain a shadow account into the real one, then delete it.
 *
 * In practice this moves almost nothing: `api/orders` attributes an order to
 * the *session* user, not to the doc it resolved from the receiver phone, so
 * today's shadows are inert husks. The repointing is here for pre-session
 * legacy orders and to keep the operation correct rather than usually-harmless.
 *
 * There is no transaction. The ordering is chosen so a crash part-way leaves
 * data already repointed at `targetId` with the shadow still holding the phone
 * — which the next attempt re-runs to completion.
 */
async function absorbShadow(
  db: Db,
  shadowId: ObjectId,
  targetId: ObjectId,
): Promise<void> {
  for (const name of USER_KEYED) {
    await db
      .collection(name)
      .updateMany({ userId: shadowId }, { $set: { userId: targetId } });
  }

  // `referredBy` is typed ObjectId | string, so both spellings need repointing.
  await db
    .collection(USERS)
    .updateMany(
      { referredBy: { $in: [shadowId, String(shadowId)] } },
      { $set: { referredBy: targetId } },
    );

  const [shadow, target] = await Promise.all([
    db.collection(USERS).findOne({ _id: shadowId }, { projection: { addresses: 1 } }),
    db.collection(USERS).findOne({ _id: targetId }, { projection: { addresses: 1 } }),
  ]);
  const shadowAddresses = shadow?.addresses ?? [];
  if (shadowAddresses.length && !(target?.addresses ?? []).length) {
    await db
      .collection(USERS)
      .updateOne(
        { _id: targetId },
        { $set: { addresses: shadowAddresses, updatedAt: new Date() } },
      );
  }

  // Must precede the phone write on the target, or the unique index rejects it.
  await db.collection(USERS).deleteOne({ _id: shadowId });
}

/**
 * Put `phone` on `userId`, absorbing a shadow account that holds it.
 *
 * An account that already has a phone keeps it: `otp/register` is reachable for
 * an email that already exists, and without that guard re-registering with a
 * different number would be an unguarded "change my number" path.
 */
export async function claimPhoneForUser(
  db: Db,
  userId: ObjectId,
  phone: string,
): Promise<PhoneClaimResult> {
  await ensurePhoneIndex(db);

  const self = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { phone: 1 } });
  if (!self) throw new Error(`claimPhoneForUser: no user ${userId}`);
  if (hasPhone(self)) return "unchanged";

  const holder = await db.collection(USERS).findOne({ phone });
  if (holder) {
    if (holder._id.equals(userId)) return "unchanged";
    if (!isShadow(holder)) return "taken";
    await absorbShadow(db, holder._id, userId);
  }

  try {
    await db
      .collection(USERS)
      .updateOne({ _id: userId }, { $set: { phone, updatedAt: new Date() } });
  } catch (e) {
    // Lost the race to a concurrent verify of the same number.
    if ((e as { code?: number }).code === 11000) return "taken";
    throw e;
  }
  return "claimed";
}

/**
 * Adopt `phone` for a legacy account that has none, at checkout.
 *
 * Unlike `claimPhoneForUser` this never absorbs a shadow account: at
 * registration the number is asserted to be yours, but at checkout it is the
 * *receiver's*, and a phoneless user ordering for a friend must not end up
 * owning the friend's number. So it writes only when nobody holds it at all.
 *
 * Best-effort throughout — an order must never fail because of this.
 */
export async function backfillPhoneIfMissing(
  db: Db,
  userId: ObjectId,
  phone: string,
): Promise<void> {
  try {
    await ensurePhoneIndex(db);

    const self = await db
      .collection(USERS)
      .findOne({ _id: userId }, { projection: { phone: 1 } });
    if (hasPhone(self)) return;

    const holder = await db
      .collection(USERS)
      .findOne({ phone }, { projection: { _id: 1 } });
    if (holder) return;

    await db
      .collection(USERS)
      .updateOne({ _id: userId }, { $set: { phone, updatedAt: new Date() } });
  } catch {
    // Including a duplicate-key race with a concurrent registration.
  }
}

/** The message shown for every rejection, revealing nothing about the owner. */
export const PHONE_TAKEN_MESSAGE =
  "This phone number is already registered with another account.";

/**
 * Whether `phone` is free for `email` to register with, checked before an OTP is
 * sent so the user finds out immediately rather than after a round trip.
 */
export async function isPhoneAvailableFor(
  db: Db,
  phone: string,
  email: string,
): Promise<boolean> {
  const holder = await db.collection(USERS).findOne({ phone });
  if (!holder) return true;
  if (typeof holder.email === "string" && holder.email === email) return true;
  return isShadow(holder);
}
