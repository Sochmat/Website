import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { Order, User } from "@/lib/types";
import { pushOrderToPetpooja, recordPushResult } from "@/lib/petpooja";
import { limiters, rateLimit } from "@/lib/rateLimit";
import { getEffectiveStoreOpen, type StoreSettingsDoc } from "@/lib/storeState";
import {
  LOCATION_AVAILABILITY_KEY,
  sanitizeLocationAvailability,
  isStoreOnAt,
  isDeliveryOnAt,
} from "@/lib/locationAvailability";
import {
  SOCIETY_DISCOUNTS_KEY,
  sanitizeDiscountMap,
  discountPercentFor,
  computeSocietyDiscount,
  offerDiscountBase,
} from "@/lib/societyDiscounts";
import { computeFirstOrderDiscount } from "@/lib/firstOrderDiscount";
import {
  DELIVERY_FEES_KEY,
  computeDeliveryFee,
  ruleFor,
  sanitizeDeliveryFeeConfig,
} from "@/lib/deliveryFees";
import { isEligibleForFirstOrderDiscount } from "@/lib/orderEligibility";
import { societyOffersFirstOrderDiscount } from "@/lib/societies";
import { couponAppliesToSociety } from "@/lib/couponScope";
import { getCustomerUserId } from "@/lib/customerSession";
import { normalizePhone } from "@/lib/phone";
import { backfillPhoneIfMissing } from "@/lib/userPhone";
import { getWalletBalance, reserveWallet } from "@/lib/wallet";
import { sweepStaleOrderRedemptions } from "@/lib/orderRedemption";
import { computeWalletApplied } from "@/lib/walletMath";
import { computePointsApplied } from "@/lib/rewards";
import {
  getRewardPointsBalance,
  reserveRewardPoints,
} from "@/lib/rewardPoints";

function generateOrderNumber() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SO-${t}-${r}`;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("_id");
    const userId = searchParams.get("userId");
    const gte = searchParams.get("gte");
    const lte = searchParams.get("lte");

    const { db } = await connectToDatabase();

    if (id) {
      const order = await db
        .collection("orders")
        .findOne({ _id: new ObjectId(id) });
      return NextResponse.json({ success: true, order });
    }

    let filter: {
      createdAt?: { $gte?: Date; $lte?: Date };
      userId?: ObjectId;
    } = {};
    if (gte || lte) {
      if (gte) filter.createdAt = { $gte: new Date(gte) };
      if (lte) filter.createdAt = { $lte: new Date(lte) };
    }
    if (userId) {
      try {
        filter.userId = new ObjectId(userId);
      } catch {
        return NextResponse.json({ success: true, orders: [] });
      }
    }

    const orders = await db
      .collection("orders")
      .find({ ...filter })
      .sort({ createdAt: -1 })
      .toArray();
    return NextResponse.json({ success: true, orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch orders" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = await rateLimit(request, limiters.order);
  if (limited) return limited;
  try {
    const { db: settingsDb } = await connectToDatabase();
    const [
      storeDoc,
      deliveryDoc,
      societyDiscountsDoc,
      deliveryFeesDoc,
      availabilityDoc,
    ] = await Promise.all([
      settingsDb.collection("settings").findOne({ key: "store" }),
      settingsDb.collection("settings").findOne({ key: "delivery" }),
      settingsDb.collection("settings").findOne({ key: SOCIETY_DISCOUNTS_KEY }),
      settingsDb.collection("settings").findOne({ key: DELIVERY_FEES_KEY }),
      settingsDb
        .collection("settings")
        .findOne({ key: LOCATION_AVAILABILITY_KEY }),
    ]);
    // Global gate first — it needs no body, so a shut store rejects before we
    // spend anything parsing the request.
    if (!getEffectiveStoreOpen(storeDoc as StoreSettingsDoc | null, new Date()).open) {
      return NextResponse.json(
        { success: false, message: "Store is currently closed" },
        { status: 503 },
      );
    }

    const body = (await request.json()) as Order;

    // Per-location gates. These only ever close: a location switched off is
    // shut even while the store is globally open, but switching one on cannot
    // reopen a globally closed store.
    const availability = sanitizeLocationAvailability(availabilityDoc);
    if (!isStoreOnAt(availability, body.societyId)) {
      return NextResponse.json(
        { success: false, message: "Store is currently closed" },
        { status: 503 },
      );
    }

    if (body.orderType === "delivery") {
      const deliveryOn =
        deliveryDoc?.on !== false && isDeliveryOnAt(availability, body.societyId);
      if (!deliveryOn) {
        return NextResponse.json(
          { success: false, message: "Delivery is currently unavailable" },
          { status: 503 },
        );
      }
    }

    // The delivery contact, not the account holder — the two are separate, and
    // ordering for someone else is normal.
    const receiverPhone = normalizePhone(body.receiver?.phone);
    if (!receiverPhone) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid 10-digit receiver.phone is required",
        },
        { status: 400 },
      );
    }
    if (!body.orderItems?.length) {
      return NextResponse.json(
        { success: false, message: "orderItems are required" },
        { status: 400 },
      );
    }
    const totalAmount = Number(body.totalAmount);
    if (Number.isNaN(totalAmount) || totalAmount < 0) {
      return NextResponse.json(
        {
          success: false,
          message: "totalAmount is required and must be a number",
        },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();

    // Canonical order identity: the signed-in session user (from the httpOnly
    // cookie), NOT the spoofable body.userId. All per-user logic — first-order
    // eligibility, wallet, referral credit, and the stored order.userId — must
    // key off the SAME id, or they silently target different documents.
    //
    // This used to fall back to a user resolved from (or created from) the
    // *receiver's* phone, which minted a shadow account under someone else's
    // number every time you ordered food for a friend. The order page is
    // auth-gated, so there was never a real guest order to serve.
    const orderUserId = await getCustomerUserId(request);
    if (!orderUserId) {
      return NextResponse.json(
        { success: false, message: "Please sign in to place an order" },
        { status: 401 },
      );
    }

    // Legacy accounts predate the required-phone rule. If this one still has no
    // number and the receiver's is unclaimed, adopt it — that is what restores
    // their eligibility for the one-time offers. Best-effort: a number that
    // belongs to someone else just means the order proceeds without a backfill.
    await backfillPhoneIfMissing(db, orderUserId, receiverPhone);

    const discountAmount = Number(body.discountAmount) || 0;
    let allowedDiscount = 0;
    let couponAllowed = 0;
    let coupon: Record<string, unknown> | null = null;
    if (body.couponCode) {
      coupon = await db.collection("coupons").findOne({
        code: String(body.couponCode).trim().toUpperCase(),
        active: true,
      });
      // A coupon scoped to other locations grants nothing here — drop it so
      // neither its discount nor its free item applies.
      if (
        coupon &&
        !couponAppliesToSociety(
          coupon.societyIds,
          typeof body.societyId === "string" ? body.societyId : undefined,
        )
      ) {
        coupon = null;
      }
    }

    // --- Server-side price recomputation (anti-tampering) -----------------
    // Never trust the client's totalAmount. Recompute the cart's minimum
    // legitimate subtotal from the DB and reject orders that undercut it. This
    // makes the amount stored on the order authoritative, which verify-order
    // later checks against the actual Razorpay payment. Unresolved products
    // only relax the floor (fail-open), so this never rejects a valid order.
    const lookupIds = new Set<string>();
    for (const it of body.orderItems) {
      if (it?.productId) lookupIds.add(String(it.productId));
      for (const a of it?.addOns ?? []) {
        if (a?.id) lookupIds.add(String(a.id));
      }
    }
    // The granted free item is excluded from the subtotal entirely (see loop
    // below), so its price never needs to enter the floor calculation.
    const freeItemId =
      coupon?.discountType === "freeItem" && coupon.freeItemId
        ? String(coupon.freeItemId)
        : null;
    const objIds: ObjectId[] = [];
    const strIds: string[] = [];
    for (const idStr of lookupIds) {
      if (ObjectId.isValid(idStr)) objIds.push(new ObjectId(idStr));
      else strIds.push(idStr);
    }
    const menuOr: Record<string, unknown>[] = [];
    if (objIds.length) menuOr.push({ _id: { $in: objIds } });
    if (strIds.length) menuOr.push({ _id: { $in: strIds } });
    const menuDocs = menuOr.length
      ? await db.collection("menuItems").find({ $or: menuOr }).toArray()
      : [];
    const menuMap = new Map<string, Record<string, unknown>>();
    for (const m of menuDocs) menuMap.set(String(m._id), m);

    let serverSubtotal = 0;
    for (const it of body.orderItems) {
      // Skip the coupon's granted free item — it's free, so it must not raise
      // the floor. Excluding it only lowers the subtotal (fail-open).
      if (freeItemId && it?.productId && String(it.productId) === freeItemId) {
        continue;
      }
      const menu = it?.productId
        ? menuMap.get(String(it.productId))
        : undefined;
      const qty = Math.max(0, Number(it.quantity) || 0);
      let unit: number;
      if (!menu) {
        // Unknown product → trust the line price (fail-open, never over-reject).
        unit = Number(it.price) || 0;
      } else {
        const variants =
          (menu.variants as { name: string; price: number }[]) ?? [];
        const matched = it.variantName
          ? variants.find((v) => v.name === it.variantName)
          : undefined;
        if (matched) {
          unit = Number(matched.price) || 0;
        } else {
          // No exact variant match → cheapest legitimate option (no false reject).
          const candidates = [
            Number(menu.price) || 0,
            ...variants.map((v) => Number(v.price) || 0),
          ];
          unit = Math.min(...candidates);
        }
      }
      let lineTotal = unit * qty;
      for (const a of it?.addOns ?? []) {
        const addMenu = a?.id ? menuMap.get(String(a.id)) : undefined;
        const addUnit = addMenu
          ? Number(addMenu.price) || 0
          : Number(a.price) || 0;
        lineTotal += addUnit * Math.max(0, Number(a.quantity) || 0);
      }
      serverSubtotal += lineTotal;
    }

    // Per-society flat discount (% of subtotal). Resolved server-side from the
    // society id so the client can't inflate it. It comes off *first*: the
    // offer discounts below are a percentage of what remains, not of the raw
    // subtotal. Being generous here only relaxes the floor, so it never
    // over-rejects.
    const societyDiscountPercent = discountPercentFor(
      sanitizeDiscountMap(societyDiscountsDoc?.discounts),
      typeof body.societyId === "string" ? body.societyId : undefined,
    );
    const societyDiscountAmount = computeSocietyDiscount(
      serverSubtotal,
      societyDiscountPercent,
    );
    const offerBase = offerDiscountBase(serverSubtotal, societyDiscountAmount);

    // Maximum monetary discount this coupon can legitimately grant: flat plus
    // percent (capped by maxDiscount). The free item is already excluded from
    // serverSubtotal, so it needs no offset here. Being generous only relaxes
    // the floor, so this never over-rejects.
    if (coupon) {
      // Honour the coupon's minimum-order condition server-side: below it the
      // coupon grants nothing, however the client priced the order. The
      // threshold is a condition on order size, so it reads the raw item
      // subtotal — not the post-location-discount base the coupon prices off.
      const couponMinAmount = Number(coupon.minAmount) || 0;
      if (couponMinAmount > 0 && serverSubtotal < couponMinAmount) {
        couponAllowed = 0;
      } else {
        let allowed = Number(coupon.discountAmount) || 0;
        const pct = Number(coupon.discountPercent) || 0;
        if (pct > 0) {
          const pctValue = (offerBase * pct) / 100;
          const maxDisc = Number(coupon.maxDiscount) || 0;
          allowed += maxDisc > 0 ? Math.min(pctValue, maxDisc) : pctValue;
        }
        couponAllowed = allowed;
      }
    }

    // First-order 20% discount — resolved server-side from the user's order
    // history so it can't be spoofed. It does NOT stack with the coupon: the
    // larger of the two is allowed (matches the client's "best value" rule).
    // The offer doesn't run at every location (e.g. not at Pivotal Paradise),
    // so the society gates it too.
    const serverEligibleFirstOrder =
      societyOffersFirstOrderDiscount(
        typeof body.societyId === "string" ? body.societyId : undefined,
      ) && (await isEligibleForFirstOrderDiscount(db, orderUserId));
    const serverFirstOrderDiscount = serverEligibleFirstOrder
      ? computeFirstOrderDiscount(offerBase)
      : 0;
    allowedDiscount = Math.max(couponAllowed, serverFirstOrderDiscount);

    // The location discount stacks on top of whichever offer won.
    allowedDiscount += societyDiscountAmount;

    // Small-order delivery fee, resolved server-side from the location's rule
    // and the server's own subtotal. Never trust body.deliveryFee: the floor
    // below only covers the pre-tax item total, so a tampered fee would
    // otherwise slip straight through.
    const serverDeliveryFee =
      body.orderType === "delivery"
        ? computeDeliveryFee(
            serverSubtotal,
            ruleFor(
              sanitizeDeliveryFeeConfig(deliveryFeesDoc),
              typeof body.societyId === "string" ? body.societyId : undefined,
            ),
          )
        : 0;

    const minAcceptable =
      Math.max(0, serverSubtotal - Math.max(0, allowedDiscount)) +
      serverDeliveryFee;

    const clientNet = Number(body.netAmount ?? body.totalAmount);
    // 1-rupee epsilon for rounding; tax/delivery only ever raise the real total.
    if (Number.isFinite(clientNet) && clientNet + 1 < minAcceptable) {
      return NextResponse.json(
        { success: false, message: "Order amount validation failed" },
        { status: 400 },
      );
    }
    // ---------------------------------------------------------------------

    const tax = Number(body.tax) ?? 0;
    const orderNumber = generateOrderNumber();

    const orderDoc: Order = {
      orderNumber,
      userId: orderUserId,
      receiver: body.receiver
        ? {
            name: body.receiver.name ?? "",
            phone: receiverPhone,
            address: body.receiver.address ?? "",
          }
        : undefined,
      orderItems: body.orderItems.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        ...(item.variantName ? { variantName: item.variantName } : {}),
        ...(item.addOns?.length
          ? {
              addOns: item.addOns.map((a) => ({
                id: a.id,
                name: a.name,
                price: Number(a.price) || 0,
                quantity: Number(a.quantity) || 0,
              })),
            }
          : {}),
      })),
      orderType: body.orderType,
      // Print agent (KOT/bill) reads order.method; derive it from orderType.
      method: body.orderType === "dine-in" ? "Dine-in" : "Delivery",
      deliveryTower:
        body.orderType === "delivery" ? body.deliveryTower : undefined,
      deliveryFloor:
        body.orderType === "delivery" ? body.deliveryFloor : undefined,
      deliveryRoom:
        body.orderType === "delivery" ? body.deliveryRoom : undefined,
      deliverySlot:
        body.orderType === "delivery" ? body.deliverySlot : undefined,
      deliveryFee: serverDeliveryFee,
      societyId: typeof body.societyId === "string" ? body.societyId : undefined,
      societyDiscount: societyDiscountAmount,
      societyDiscountPercent,
      // Capped at the server-computed amount so a client can't inflate it; >0
      // marks this order as having claimed the first-order discount.
      firstOrderDiscount: Math.min(
        Math.max(0, Number(body.firstOrderDiscount) || 0),
        serverFirstOrderDiscount,
      ),
      totalAmount,
      discountAmount,
      tax,
      netAmount: totalAmount,
      couponCode: body.couponCode ?? undefined,
      paymentStatus: "pending" as const,
      status: "pending" as const,
      paymentMethod: body.paymentMethod ?? "cash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("orders").insertOne(orderDoc as any);
    let order = await db
      .collection("orders")
      .findOne({ _id: result.insertedId });

    // Redemption — wallet credit first, then reward points on whatever payable
    // remains. Both are auto-applied unless the client opted out, and both are
    // reserved at creation so a balance can't be double-spent across concurrent
    // checkouts; the reservations settle at payment (reconcile) or are refunded
    // on fail/sweep. Only for online orders — COD never reaches the settle path.
    const online = orderDoc.paymentMethod !== "cash";
    const wantWallet =
      (body as { useWallet?: boolean }).useWallet !== false && online;
    const wantPoints =
      (body as { useRewardPoints?: boolean }).useRewardPoints !== false &&
      online;

    // Reclaim any reservations from this user's abandoned checkouts first —
    // this must run even at a zero live balance, since a balance can read 0
    // precisely because it's all tied up in a stale reservation.
    if (wantWallet || wantPoints) {
      await sweepStaleOrderRedemptions(db, orderUserId, 30 * 60 * 1000);
    }

    // Tracks the payable as each balance is applied, so the MIN_PAYABLE floor
    // is enforced once across both rather than twice.
    let payableSoFar = totalAmount;

    if (wantWallet) {
      const balance = await getWalletBalance(db, orderUserId);
      const { walletApplied, amountPayable } = computeWalletApplied(
        balance,
        payableSoFar,
      );
      if (walletApplied > 0) {
        const reserved = await reserveWallet(
          db,
          orderUserId,
          result.insertedId,
          walletApplied,
        );
        if (reserved) {
          payableSoFar = amountPayable;
          // netAmount is what Razorpay is charged and what reconcile verifies.
          await db.collection("orders").updateOne(
            { _id: result.insertedId },
            {
              $set: {
                walletApplied,
                amountPayable,
                netAmount: amountPayable,
                updatedAt: new Date(),
              },
            },
          );
        }
      }
    }

    if (wantPoints) {
      const balance = await getRewardPointsBalance(db, orderUserId);
      const { pointsApplied, amountPayable } = computePointsApplied(
        balance,
        payableSoFar,
      );
      if (pointsApplied > 0) {
        const reserved = await reserveRewardPoints(
          db,
          orderUserId,
          result.insertedId,
          pointsApplied,
        );
        if (reserved) {
          payableSoFar = amountPayable;
          await db.collection("orders").updateOne(
            { _id: result.insertedId },
            {
              $set: {
                pointsApplied,
                amountPayable,
                netAmount: amountPayable,
                updatedAt: new Date(),
              },
            },
          );
        }
      }
    }

    if (wantWallet || wantPoints) {
      order = await db.collection("orders").findOne({ _id: result.insertedId });
    }

    // COD orders are pushed to Petpooja at creation (online orders push from
    // verify-order once payment is confirmed). The push never blocks the
    // response: its outcome is recorded on the order for admin to handle.
    if (order && orderDoc.paymentMethod === "cash") {
      const pushResult = await pushOrderToPetpooja(
        order as unknown as Order,
        db,
      );
      await recordPushResult(db, result.insertedId, pushResult);
      order = await db.collection("orders").findOne({ _id: result.insertedId });
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create order" },
      { status: 500 },
    );
  }
}
