import type { Db, WithId, Document } from "mongodb";
import { ObjectId } from "mongodb";
import Razorpay from "razorpay";
import type { Order } from "@/lib/types";
import { pushOrderToPetpooja, recordPushResult } from "@/lib/petpooja";
import { logPayment, type PaymentLogEntry } from "@/lib/paymentLog";
import { settleWallet, creditReferral } from "@/lib/wallet";
import { awardRewardPoints, settleRewardPoints } from "@/lib/rewardPoints";
import {
  expectedChargePaise,
  type OrderChargeFields,
} from "@/lib/orderAmounts";
import { reapplyOrderRedemptions } from "@/lib/orderRedemption";

/** The correlation fields shared by every log row in a reconciliation. */
type LogBase = Pick<
  PaymentLogEntry,
  "route" | "orderId" | "razorpayOrderId" | "razorpayPaymentId" | "meta"
>;

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export interface ReconcileParams {
  /** The route that triggered reconciliation, used for the payment log. */
  route: string;
  /** How we got here — the client verify call or the Razorpay webhook. */
  source: "verify" | "webhook";
  /** Genuine Razorpay ids (signature already validated by the caller). */
  razorpayOrderId: string;
  razorpayPaymentId: string;
  /** Internal order/subscription id, when the caller already knows it. */
  orderId?: string;
  /** Which collection to reconcile against; helps the webhook pick a collection. */
  flowHint?: "order" | "subscription";
}

export interface ReconcileOutcome {
  /** True when the record is (now, or already was) paid. */
  success: boolean;
  /** Suggested HTTP status for the caller to return. */
  status: number;
  /** Machine-readable stage, mirrors the logged stage. */
  stage: string;
  message: string;
  /**
   * Transient failure (Razorpay fetch / DB hiccup): the caller should return a
   * 5xx so Razorpay retries the webhook. Terminal outcomes leave this false so
   * retries don't hammer a record that will never reconcile.
   */
  retryable: boolean;
}

/**
 * Single source of truth for "a captured Razorpay payment settles this order".
 *
 * Both the client `verify-order` call and the server-side Razorpay webhook run
 * this — the webhook is the safety net for when the client success callback
 * never fires (UPI-intent app redirect evicts the page, tab closed, network
 * drop), which otherwise leaves a captured payment stuck on a `pending` order.
 *
 * The caller is responsible for authenticating the request (checkout signature
 * for verify, webhook signature for the webhook) BEFORE calling this. Here we
 * only trust the ids after re-fetching the payment from Razorpay and matching
 * it to the internal order (id, captured status, and amount).
 *
 * Fully idempotent: an already-paid record short-circuits, so verify and the
 * webhook racing (or Razorpay retrying) never double-pays or double-pushes.
 */
export async function reconcilePayment(
  db: Db,
  params: ReconcileParams,
): Promise<ReconcileOutcome> {
  const { route, source, razorpayOrderId, razorpayPaymentId } = params;
  const base: LogBase = {
    route,
    orderId: params.orderId ? String(params.orderId) : undefined,
    razorpayOrderId: razorpayOrderId ? String(razorpayOrderId) : undefined,
    razorpayPaymentId: razorpayPaymentId ? String(razorpayPaymentId) : undefined,
    meta: { source },
  };

  // --- Resolve the internal order -----------------------------------------
  // Prefer the explicit id (verify path); otherwise map back from the Razorpay
  // order id we stamped on the record at create-order time (webhook path).
  const _id =
    params.orderId && ObjectId.isValid(params.orderId)
      ? new ObjectId(params.orderId)
      : null;

  const order = _id
    ? await db.collection("orders").findOne({ _id })
    : await db.collection("orders").findOne({ razorpayOrderId });

  if (order) {
    return reconcileOrder(db, order, { ...params, base });
  }

  // --- Not an order → try a legacy subscription ---------------------------
  const subQuery = _id ? { _id } : { razorpayOrderId };
  const sub = await db.collection("subscriptions").findOne(subQuery);
  if (sub) {
    if (sub.paymentStatus === "paid") {
      await logPayment(db, {
        ...base,
        flow: "subscription",
        stage: "already-paid",
        outcome: "success",
        message: "Subscription was already marked paid (idempotent retry)",
      });
      return {
        success: true,
        status: 200,
        stage: "already-paid",
        message: "Payment already verified",
        retryable: false,
      };
    }
    await db.collection("subscriptions").updateOne(
      { _id: sub._id },
      {
        $set: {
          paymentStatus: "paid",
          paymentId: razorpayPaymentId,
          razorpayOrderId,
          updatedAt: new Date(),
        },
      },
    );
    await logPayment(db, {
      ...base,
      flow: "subscription",
      stage: "subscription-paid",
      outcome: "success",
      message: "Legacy subscription marked paid",
    });
    return {
      success: true,
      status: 200,
      stage: "subscription-paid",
      message: "Payment verified successfully!",
      retryable: false,
    };
  }

  // --- Nothing matched -----------------------------------------------------
  await logPayment(db, {
    ...base,
    flow: params.flowHint ?? "unknown",
    stage: "no-matching-record",
    outcome: "failure",
    message: "No order or subscription matched this payment",
  });
  return {
    success: false,
    status: 200, // terminal: retrying the webhook can't conjure a record
    stage: "no-matching-record",
    message: "No matching order",
    retryable: false,
  };
}

/** Order-flow reconciliation: validate the payment against the order, mark paid, push. */
async function reconcileOrder(
  db: Db,
  order: WithId<Document>,
  ctx: ReconcileParams & { base: LogBase },
): Promise<ReconcileOutcome> {
  const { razorpayOrderId, razorpayPaymentId, base } = ctx;
  const _id = order._id as ObjectId;
  const logBase = { ...base, flow: "order" as const };

  // Idempotent: an already-paid order short-circuits (no double push).
  if (order.paymentStatus === "paid") {
    await logPayment(db, {
      ...logBase,
      stage: "already-paid",
      outcome: "success",
      message: "Order was already marked paid (idempotent retry)",
    });
    return {
      success: true,
      status: 200,
      stage: "already-paid",
      message: "Payment already verified",
      retryable: false,
    };
  }

  // Fetch the real payment from Razorpay and validate it end-to-end.
  let payment: { order_id?: string; status?: string; amount?: number };
  try {
    payment = (await razorpay.payments.fetch(
      String(razorpayPaymentId),
    )) as typeof payment;
  } catch (err) {
    const e = err as {
      message?: string;
      statusCode?: number;
      error?: { code?: string };
    };
    console.error("Razorpay payment fetch failed:", err);
    await logPayment(db, {
      ...logBase,
      stage: "payment-fetch-error",
      outcome: "failure",
      message: "Could not fetch the payment from Razorpay",
      error: e?.message,
      errorCode:
        e?.error?.code ?? (e?.statusCode ? String(e.statusCode) : undefined),
    });
    return {
      success: false,
      status: 502,
      stage: "payment-fetch-error",
      message: "Could not verify payment",
      retryable: true,
    };
  }

  // The amount this Razorpay order was raised for, frozen at create-order time.
  // It survives a fail-time refund handing the customer's balance back, so a
  // payment that captures late still reconciles at the figure it was made for.
  const expectedAmount = expectedChargePaise(
    order as OrderChargeFields,
    razorpayOrderId,
  );
  const orderIdMatches = payment.order_id === razorpayOrderId;
  const isCaptured = payment.status === "captured";
  const amountMatches = Number(payment.amount) === expectedAmount;
  if (!orderIdMatches || !isCaptured || !amountMatches) {
    const reasons = [
      !orderIdMatches && "order-id",
      !isCaptured && "not-captured",
      !amountMatches && "amount",
    ].filter(Boolean) as string[];
    console.warn("Payment/order mismatch on reconcile", {
      orderId: String(_id),
      paymentOrderId: payment.order_id,
      status: payment.status,
      paid: payment.amount,
      expectedAmount,
    });
    await logPayment(db, {
      ...logBase,
      stage: `mismatch:${reasons.join("+")}`,
      outcome: "failure",
      message: `Payment does not match order (${reasons.join(", ")})`,
      paymentStatus: payment.status,
      amountPaise: Number(payment.amount),
      expectedAmountPaise: expectedAmount,
      meta: {
        ...(logBase.meta ?? {}),
        paymentOrderId: payment.order_id,
        hint: !isCaptured
          ? "Payment is authorized but not captured — enable auto-capture in Razorpay, or capture on verify."
          : undefined,
      },
    });
    // An authorized-but-not-captured payment may become captured shortly, so
    // let the webhook retry; a genuine id/amount mismatch is terminal.
    return {
      success: false,
      status: !isCaptured && orderIdMatches ? 409 : 400,
      stage: `mismatch:${reasons.join("+")}`,
      message: "Payment does not match order",
      retryable: !isCaptured && orderIdMatches,
    };
  }

  // Reject payment-id replay: a captured payment settles exactly one order.
  const reused = await db
    .collection("orders")
    .findOne({ paymentId: razorpayPaymentId, _id: { $ne: _id } });
  if (reused) {
    await logPayment(db, {
      ...logBase,
      stage: "replay",
      outcome: "failure",
      message: "This payment was already used on another order",
      meta: { ...(logBase.meta ?? {}), reusedOrderId: String(reused._id) },
    });
    return {
      success: false,
      status: 409,
      stage: "replay",
      message: "Payment already used",
      retryable: false,
    };
  }

  // Guard the transition on "not already paid" so that when verify and the
  // webhook race, exactly one caller wins it and runs the paid-once side
  // effects (wallet settle, referral credit, Petpooja push) below.
  const transition = await db.collection("orders").updateOne(
    { _id, paymentStatus: { $ne: "paid" } },
    {
      $set: {
        paymentStatus: "paid",
        paymentId: razorpayPaymentId,
        razorpayOrderId,
        // Freeze the promised ready time at 30 minutes from payment.
        expectedReadyAt: new Date(Date.now() + 30 * 60 * 1000),
        updatedAt: new Date(),
      },
    },
  );
  const didTransition = transition.modifiedCount === 1;

  await logPayment(db, {
    ...logBase,
    stage: "verified",
    outcome: "success",
    message: didTransition
      ? "Payment verified and order marked paid"
      : "Payment verified; order was concurrently marked paid",
    paymentStatus: payment.status,
    amountPaise: Number(payment.amount),
    expectedAmountPaise: expectedAmount,
  });

  // Paid-once side effects — only the caller that won the transition runs them,
  // so a verify/webhook race never double-settles, double-credits, or double-pushes.
  if (didTransition) {
    const userId = order.userId as ObjectId | undefined;
    // A failed/abandoned checkout hands the wallet credit and reward points
    // back immediately. This payment says the checkout was not abandoned after
    // all, so retake them BEFORE settling — and before awardRewardPoints, which
    // reads netAmount to work out what the customer was actually charged.
    const retaken = await reapplyOrderRedemptions(db, _id);
    if (retaken.shortfall) {
      await logPayment(db, {
        ...logBase,
        stage: "redemption-reapply-short",
        outcome: "failure",
        message:
          "Late payment settled an order whose released redemption could not be fully retaken",
        meta: { ...(logBase.meta ?? {}), shortfall: retaken.shortfall },
      });
    }
    // Read the applied figures back rather than trusting the copy fetched at
    // the top of this call: a release (or the retake above) may have rewritten
    // them since, and settling anything other than what the order really
    // redeemed would file a ledger row for money that was never held.
    const settled = await db
      .collection("orders")
      .findOne(
        { _id },
        { projection: { walletApplied: 1, pointsApplied: 1 } },
      );
    const walletApplied = Number(settled?.walletApplied ?? 0);
    const pointsApplied = Number(settled?.pointsApplied ?? 0);
    if (userId) {
      // Settle the wallet reservation (balance was decremented at reserve) and
      // credit the referrer for this user's first paid order (idempotent).
      if (walletApplied > 0) {
        await settleWallet(db, userId, _id, walletApplied);
      }
      if (pointsApplied > 0) {
        await settleRewardPoints(db, userId, _id, pointsApplied);
      }
      await creditReferral(db, userId);
      // Reward points for this order + the streak advance. Inside the
      // didTransition guard, so a verify/webhook race can't double-credit.
      await awardRewardPoints(db, userId, _id, new Date());
    }

    // Order is now paid — push it to Petpooja. The push never blocks
    // verification; its outcome is recorded on the order for admin.
    const paidOrder = await db.collection("orders").findOne({ _id });
    if (paidOrder) {
      const pushResult = await pushOrderToPetpooja(
        paidOrder as unknown as Order,
        db,
      );
      await recordPushResult(db, _id, pushResult);
    }
  }

  return {
    success: true,
    status: 200,
    stage: "verified",
    message: "Payment verified successfully!",
    retryable: false,
  };
}
