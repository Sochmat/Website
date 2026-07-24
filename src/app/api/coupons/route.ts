import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

/**
 * Validate a coupon code typed by the customer. Codes are never listed to the
 * storefront — the customer must know the exact code — so every condition
 * (existence, active flag, minimum order amount, free-item availability) is
 * checked here and only a matching coupon is returned.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body?.code ?? "")
      .trim()
      .toUpperCase();
    const totalPrice = Number(body?.totalPrice) || 0;

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
