/**
 * Pure wallet/referral money math — safe to import on the client (no DB).
 * The DB-touching wallet operations live in wallet.ts (server only).
 */

/** Razorpay cannot charge ₹0, so wallet always leaves at least this much payable. */
export const MIN_PAYABLE = 1;

/** ₹ credited to a referrer when their referee's first order is paid. */
export const REFERRAL_REWARD = 75;

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
