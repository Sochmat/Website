/**
 * Pure wallet/referral money math — safe to import on the client (no DB).
 * The DB-touching wallet operations live in wallet.ts (server only).
 */

/** Razorpay cannot charge ₹0, so wallet always leaves at least this much payable. */
export const MIN_PAYABLE = 1;

/**
 * ₹ credited to a referrer when a referee's first order is paid, by referral
 * number: the 1st pays ₹75 and each further one steps up ₹25, flattening at
 * ₹200 from the 6th on.
 */
export const REFERRAL_REWARDS = [75, 100, 125, 150, 175, 200] as const;

/** What a first referral pays — the headline number in share copy. */
export const REFERRAL_REWARD = REFERRAL_REWARDS[0];

/** The top of the ladder, paid by every referral past the 6th. */
export const REFERRAL_REWARD_MAX =
  REFERRAL_REWARDS[REFERRAL_REWARDS.length - 1];

/** The reward for someone's `n`th referral (1-based), clamped to the ladder. */
export function referralRewardFor(n: number): number {
  const rung = Math.min(
    Math.max(Math.floor(n) || 1, 1),
    REFERRAL_REWARDS.length,
  );
  return REFERRAL_REWARDS[rung - 1];
}

/**
 * How much wallet balance to apply to an order total, capped so at least
 * MIN_PAYABLE remains for Razorpay to charge. Never negative, never more than
 * the balance or the spendable portion of the total.
 */
export function computeWalletApplied(
  balance: number,
  totalAmount: number,
): { walletApplied: number; amountPayable: number } {
  const spendable = Math.max(0, Math.floor(totalAmount) - MIN_PAYABLE);
  const walletApplied = Math.max(
    0,
    Math.min(Math.floor(Math.max(0, balance)), spendable),
  );
  return { walletApplied, amountPayable: totalAmount - walletApplied };
}
