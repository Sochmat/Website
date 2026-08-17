import { Db, ObjectId } from "mongodb";
import { istMonth, istToday } from "./ist";
import type { OrderAmountFields } from "./orderAmounts";
import {
  computePointsEarned,
  nextStreak,
  rewardBaseFor,
  type StreakState,
} from "./rewards";
import {
  STREAK_LADDERS_KEY,
  isStreakDisabled,
  ladderFor,
  rateForStreak,
  sanitizeStreakConfig,
  type StreakConfig,
} from "./streakLadder";
import type { RewardTransaction } from "./types";

const USERS = "users";
const ORDERS = "orders";
const LEDGER = "rewardTransactions";
const SETTINGS = "settings";

/**
 * The `settings` document key for the admin-managed closure dates. It no longer
 * affects the streak — a gap of any length is free within a month — but the
 * admin editor still writes here, so the key stays owned by this module.
 */
export const STREAK_EXEMPT_DATES_KEY = "streakExemptDates";

function ledgerEntry(
  entry: Omit<RewardTransaction, "createdAt">,
): RewardTransaction {
  return { ...entry, createdAt: new Date() };
}

export async function getRewardPointsBalance(
  db: Db,
  userId: ObjectId,
): Promise<number> {
  const user = await db
    .collection(USERS)
    .findOne({ _id: userId }, { projection: { rewardPoints: 1 } });
  return Number(user?.rewardPoints ?? 0);
}

/**
 * The per-location streak config: ladders, plus the locations opted out. Unset
 * locations inherit the default ladder and are enabled.
 */
export async function getStreakConfig(db: Db): Promise<StreakConfig> {
  const doc = await db
    .collection(SETTINGS)
    .findOne({ key: STREAK_LADDERS_KEY });
  return sanitizeStreakConfig(doc);
}

/** The stored streak, or null when there isn't a usable one yet. */
function readStreak(user: {
  streakCount?: unknown;
  streakLastDate?: unknown;
} | null): StreakState | null {
  const count = Number(user?.streakCount ?? 0);
  const lastDate = user?.streakLastDate;
  if (!(count > 0) || typeof lastDate !== "string" || !lastDate) return null;
  return { count, lastDate };
}

/**
 * Everything the cart and the rewards card need: the balance, the day count as
 * it stands, what an order placed right now would produce, and the ladder those
 * rates come from. Display only — the award path recomputes all of it at payment
 * time from the order's OWN location.
 *
 * `societyId` is the location the customer is currently ordering to. It selects
 * the ladder and decides whether the streak runs there at all; it has no bearing
 * on the day count, which is per customer.
 */
export async function getRewardSummary(
  db: Db,
  userId: ObjectId,
  now: Date,
  societyId?: string | null,
): Promise<{
  points: number;
  streak: number;
  nextStreak: number;
  nextRate: number;
  rates: number[];
  /** False when this location is opted out — no earning, no day advance. */
  enabled: boolean;
}> {
  const [user, config] = await Promise.all([
    db
      .collection(USERS)
      .findOne(
        { _id: userId },
        { projection: { rewardPoints: 1, streakCount: 1, streakLastDate: 1 } },
      ),
    getStreakConfig(db),
  ]);
  const today = istToday(now);
  const stored = readStreak(
    user as { streakCount?: unknown; streakLastDate?: unknown } | null,
  );
  // Report the count for the CURRENT cycle, not the raw stored one. A count left
  // over from last month is spent — surfacing it would show "6 days · 10%",
  // which reads as a bug. The stored value stays untouched until the next paid
  // order overwrites it.
  const banked =
    stored && istMonth(stored.lastDate) === istMonth(today) ? stored.count : 0;
  const projected = nextStreak(stored, today);
  const ladder = ladderFor(config.ladders, societyId);
  return {
    points: Number(user?.rewardPoints ?? 0),
    streak: banked,
    nextStreak: projected,
    nextRate: rateForStreak(projected, ladder),
    rates: ladder,
    enabled: !isStreakDisabled(config.disabled, societyId),
  };
}

/**
 * Atomically hold `amount` points for an order. Guarded on sufficient balance
 * so it can't go negative or double-spend across concurrent checkouts. Returns
 * false (and reserves nothing) if the balance moved underneath.
 */
export async function reserveRewardPoints(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<boolean> {
  if (amount <= 0) return true;
  const res = await db
    .collection(USERS)
    .updateOne(
      { _id: userId, rewardPoints: { $gte: amount } },
      { $inc: { rewardPoints: -amount }, $set: { updatedAt: new Date() } },
    );
  if (res.matchedCount === 0) return false;
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "reserved", amount }));
  return true;
}

/** Reserved → spent. The balance was already decremented at reserve time. */
export async function settleRewardPoints(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "spent", amount }));
}

/**
 * Return a reservation to the balance.
 *
 * Contract: the caller must have atomically zeroed `order.pointsApplied` in
 * the same guarded update that told it `amount`. This function itself does an
 * unconditional `$inc` — it has no idempotency of its own. A caller that
 * instead reads `pointsApplied` and credits it in a separate, non-atomic step
 * can retry (or race) and double-refund the same order.
 *
 * `refundOrderRedemptions` in orderRedemption.ts is the caller that discharges
 * that contract: it zeroes `walletApplied` and `pointsApplied` together in one
 * guarded update before calling this helper and `creditWalletRefund` in
 * wallet.ts — the wallet-side sibling with the identical shape and the
 * identical obligation.
 */
export async function creditRewardPointsRefund(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;
  await db
    .collection(USERS)
    .updateOne(
      { _id: userId },
      { $inc: { rewardPoints: amount }, $set: { updatedAt: new Date() } },
    );
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "refunded", amount }));
}

/**
 * Credit the points a paid order earned and advance the customer's streak.
 *
 * The rate applies to what the customer was actually charged — see
 * `rewardBaseFor`. That figure only settles once wallet credit and redeemed
 * points have been written, which is why the base is read here at payment time
 * rather than frozen onto the order at creation.
 *
 * Self-idempotent: `rewardsAwarded` is claimed atomically before anything is
 * credited, mirroring `creditReferral` in wallet.ts, so two concurrent
 * callers for the same order (verify racing the webhook, or a manual re-run)
 * can never both pay out — only the update that flips the flag proceeds.
 *
 * The streak advance is guarded on `streakLastDate !== today` so a second order
 * on the same day earns points at the same rate without advancing the day.
 *
 * The rate comes from THIS order's location: the day count is per customer, but
 * which ladder converts it into a percentage is per location. A location that is
 * switched off awards nothing and does not advance the day count — it is out of
 * the scheme, so an order there neither earns nor costs the customer progress.
 */
export async function awardRewardPoints(
  db: Db,
  userId: ObjectId,
  orderId: ObjectId,
  now: Date,
): Promise<void> {
  const order = await db.collection(ORDERS).findOne(
    { _id: orderId },
    {
      projection: {
        totalAmount: 1,
        netAmount: 1,
        amountPayable: 1,
        walletApplied: 1,
        pointsApplied: 1,
        societyId: 1,
      },
    },
  );
  // The charged amount, read from the order at payment time — by which point
  // redemption has been applied and netAmount is final.
  const rewardBase = rewardBaseFor((order ?? {}) as OrderAmountFields);
  if (!(rewardBase > 0)) return;

  const societyId = typeof order?.societyId === "string" ? order.societyId : null;
  const config = await getStreakConfig(db);
  // Switched off for this location: award nothing and leave the day count
  // untouched. Returning before the claim is safe precisely because nothing
  // has been credited, so a later re-run simply reaches the same conclusion.
  if (isStreakDisabled(config.disabled, societyId)) return;

  // Claim the award atomically before crediting anything — mirrors
  // creditReferral in wallet.ts. Two concurrent callers for the same order
  // both pass a plain "already awarded?" read; only one can win this update.
  const claimed = await db
    .collection(ORDERS)
    .updateOne(
      { _id: orderId, rewardsAwarded: { $ne: true } },
      { $set: { rewardsAwarded: true, updatedAt: new Date() } },
    );
  if (claimed.matchedCount === 0) return; // another caller owns this award

  const user = await db
    .collection(USERS)
    .findOne(
      { _id: userId },
      { projection: { streakCount: 1, streakLastDate: 1 } },
    );

  const today = istToday(now);
  const streakAfter = nextStreak(
    readStreak(user as { streakCount?: unknown; streakLastDate?: unknown } | null),
    today,
  );
  const ladder = ladderFor(config.ladders, societyId);
  const rate = rateForStreak(streakAfter, ladder);
  const points = computePointsEarned(rewardBase, rate);

  const advanced = await db.collection(USERS).updateOne(
    { _id: userId, streakLastDate: { $ne: today } },
    {
      $set: {
        streakCount: streakAfter,
        streakLastDate: today,
        updatedAt: new Date(),
      },
      $inc: { rewardPoints: points },
    },
  );
  if (advanced.matchedCount === 0) {
    // The streak was already advanced today (an earlier order, or a concurrent
    // one that won this update) — credit the points but leave the day alone.
    await db
      .collection(USERS)
      .updateOne(
        { _id: userId },
        { $inc: { rewardPoints: points }, $set: { updatedAt: new Date() } },
      );
  }

  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(
      ledgerEntry({
        userId,
        orderId,
        type: "earned",
        amount: points,
        rate,
        streakAfter,
      }),
    );
  await db.collection(ORDERS).updateOne(
    { _id: orderId },
    {
      $set: {
        pointsEarned: points,
        pointsRate: rate,
        // The cap of the ladder that was in force, frozen here so the success
        // screen can say "you're at the maximum" without re-resolving a config
        // that may since have changed.
        pointsRateMax: ladder[ladder.length - 1],
        streakAfter,
        updatedAt: new Date(),
      },
    },
  );
}

/**
 * Claw back the points a now-refunded order earned. Idempotent: `pointsEarned`
 * is zeroed in the same guarded update that reads it, so a second call is a
 * no-op. Clamped by a balance guard — the customer may already have spent
 * them, and a loyalty balance must never go negative. Returns points reversed.
 */
export async function reverseRewardPointsForOrder(
  db: Db,
  orderId: ObjectId,
): Promise<number> {
  const before = await db
    .collection(ORDERS)
    .findOneAndUpdate(
      { _id: orderId, pointsEarned: { $gt: 0 } },
      { $set: { pointsEarned: 0, updatedAt: new Date() } },
      { returnDocument: "before" },
    );
  const earned = Number(before?.pointsEarned ?? 0);
  const userId = before?.userId as ObjectId | undefined;
  if (earned <= 0 || !userId) return 0;

  const taken = await db
    .collection(USERS)
    .updateOne(
      { _id: userId, rewardPoints: { $gte: earned } },
      { $inc: { rewardPoints: -earned }, $set: { updatedAt: new Date() } },
    );
  // Balance already dipped below what this order earned — the points are spent.
  // Take nothing rather than drive the balance negative.
  const amount = taken.matchedCount === 0 ? 0 : earned;
  // Always logged, even when amount is 0: a zero-amount "reversed" row is an
  // intentional audit trail for a clawback that was attempted but couldn't be
  // taken (points already spent), not a bug — it records the attempt, not a
  // balance change.
  await db
    .collection<RewardTransaction>(LEDGER)
    .insertOne(ledgerEntry({ userId, orderId, type: "reversed", amount }));
  return amount;
}
