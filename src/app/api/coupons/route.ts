import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { couponAppliesToSociety } from "@/lib/couponScope";
import { getSocietyById } from "@/lib/societies";

type PublicFreeItem = { id: string; name: string; price: number };

/**
 * List the coupons on offer at a location, so checkout can show them to pick
 * from. Only active, non-hidden coupons scoped to this location are returned,
 * and a free-item coupon whose item is gone is dropped. Coupons below the
 * cart's minimum are still listed (checkout shows what's needed to unlock
 * them); applying always goes through POST, which re-checks every condition.
 *
 * Hidden coupons are deliberately absent — they still work, but only for a
 * customer who knows the code and types it in.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const societyId = searchParams.get("societyId") ?? undefined;

    const { db } = await connectToDatabase();
    const docs = await db
      .collection("coupons")
      .find({ active: true, hidden: { $ne: true } })
      .toArray();
    const scoped = docs.filter((c) =>
      couponAppliesToSociety(c.societyIds, societyId),
    );

    // Resolve every granted free item in one query so each coupon can be
    // labelled ("Free Cold Coffee") without a second request.
    const freeItemIds = scoped
      .map((c) => String(c.freeItemId ?? ""))
      .filter((id) => id && ObjectId.isValid(id));
    const freeItems = new Map<string, PublicFreeItem>();
    if (freeItemIds.length > 0) {
      const items = await db
        .collection("menuItems")
        .find({ _id: { $in: freeItemIds.map((id) => new ObjectId(id)) } })
        .toArray();
      for (const item of items) {
        freeItems.set(item._id.toString(), {
          id: item._id.toString(),
          name: item.name,
          price: item.price ?? 0,
        });
      }
    }

    const coupons = scoped
      .map((c) => {
        const discountType = c.discountType ?? "flat";
        const freeItem =
          discountType === "freeItem"
            ? (freeItems.get(String(c.freeItemId ?? "")) ?? null)
            : null;
        return {
          code: c.code,
          discountType,
          discountAmount: c.discountAmount ?? 0,
          discountPercent: c.discountPercent ?? 0,
          maxDiscount: c.maxDiscount ?? 0,
          minAmount: Number(c.minAmount) || 0,
          ...(freeItem ? { freeItemId: String(c.freeItemId), freeItem } : {}),
        };
      })
      // A free-item coupon with no resolvable item can't be honoured.
      .filter((c) => c.discountType !== "freeItem" || c.freeItem);

    return NextResponse.json(
      { success: true, coupons },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error listing coupons:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load coupons" },
      { status: 500 },
    );
  }
}

/**
 * Validate a coupon code — typed by the customer, or picked from the list
 * above. Every condition (existence, active flag, location scope, minimum
 * order amount, free-item availability) is checked here and only a matching
 * coupon is returned.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body?.code ?? "")
      .trim()
      .toUpperCase();
    const totalPrice = Number(body?.totalPrice) || 0;
    const societyId =
      typeof body?.societyId === "string" ? body.societyId : undefined;

    if (!code) {
      return NextResponse.json(
        { success: false, message: "Please enter a coupon code" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const coupon = await db
      .collection("coupons")
      .findOne({ code, active: true });

    if (!coupon) {
      return NextResponse.json(
        { success: false, message: "Invalid coupon code" },
        { status: 404 },
      );
    }

    // Location-scoped coupons are only honoured at their own locations.
    if (!couponAppliesToSociety(coupon.societyIds, societyId)) {
      return NextResponse.json(
        {
          success: false,
          message: `This coupon isn't available at ${getSocietyById(societyId).name}`,
        },
        { status: 400 },
      );
    }

    const minAmount = Number(coupon.minAmount) || 0;
    if (minAmount > 0 && totalPrice < minAmount) {
      return NextResponse.json(
        {
          success: false,
          message: `This coupon needs a minimum order of Rs ${minAmount}`,
        },
        { status: 400 },
      );
    }

    const base = {
      code: coupon.code,
      discountType: coupon.discountType ?? "flat",
      discountAmount: coupon.discountAmount ?? 0,
      discountPercent: coupon.discountPercent ?? 0,
      minAmount,
      maxDiscount: coupon.maxDiscount ?? 0,
    };

    if (base.discountType !== "freeItem") {
      return NextResponse.json({ success: true, coupon: base });
    }

    // Resolve the granted item (name + price) so the storefront can label and
    // grant it without a second request.
    let freeItem: { id: string; name: string; price: number } | null = null;
    if (coupon.freeItemId && ObjectId.isValid(String(coupon.freeItemId))) {
      const item = await db
        .collection("menuItems")
        .findOne({ _id: new ObjectId(String(coupon.freeItemId)) });
      if (item) {
        freeItem = {
          id: item._id.toString(),
          name: item.name,
          price: item.price ?? 0,
        };
      }
    }

    if (!freeItem) {
      return NextResponse.json(
        {
          success: false,
          message: "This coupon's free item is unavailable",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      coupon: { ...base, freeItemId: String(coupon.freeItemId), freeItem },
    });
  } catch (error) {
    console.error("Error validating coupon:", error);
    return NextResponse.json(
      { success: false, message: "Failed to validate coupon" },
      { status: 500 },
    );
  }
}
