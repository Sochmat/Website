import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { Coupon } from "@/lib/types";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const coupons = await db.collection("coupons").find({}).toArray();
    return NextResponse.json({ success: true, coupons });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch coupons" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const data: Coupon = await request.json();
    const discountType = data.discountType === "percent" ? "percent" : "flat";
    const coupon: Record<string, unknown> = {
      code: data.code.trim().toUpperCase(),
      discountType,
      active: data.active !== false,
      minAmount: Number(data.minAmount) || 0,
    };

    if (discountType === "percent") {
      coupon.discountPercent = Number(data.discountPercent) || 0;
      coupon.maxDiscount = Number(data.maxDiscount) || 0;
      coupon.discountAmount = 0;
    } else {
      coupon.discountAmount = Number(data.discountAmount) || 0;
      coupon.discountPercent = 0;
      coupon.maxDiscount = 0;
    }
    const result = await db.collection("coupons").insertOne(coupon);
    return NextResponse.json({
      success: true,
      coupon: { ...coupon, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error creating coupon:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create coupon" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const data = await request.json();
    const { id, ...fields } = data;
    if (!id) {
      return NextResponse.json(
        { success: false, message: "id required" },
        { status: 400 }
      );
    }

    const discountType = fields.discountType === "percent" ? "percent" : "flat";
    const update: Record<string, unknown> = {
      code: String(fields.code ?? "").trim().toUpperCase(),
      discountType,
      active: fields.active !== false,
      minAmount: Number(fields.minAmount) || 0,
    };

    if (discountType === "percent") {
      update.discountPercent = Number(fields.discountPercent) || 0;
      update.maxDiscount = Number(fields.maxDiscount) || 0;
      update.discountAmount = 0;
    } else {
      update.discountAmount = Number(fields.discountAmount) || 0;
      update.discountPercent = 0;
      update.maxDiscount = 0;
    }

    await db
      .collection("coupons")
      .updateOne({ _id: new ObjectId(id) }, { $set: update });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating coupon:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update coupon" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, message: "id required" },
        { status: 400 }
      );
    }
    await db.collection("coupons").deleteOne({ _id: new ObjectId(id) });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete coupon" },
      { status: 500 }
    );
  }
}
