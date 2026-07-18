import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { isBracketKey } from "@/lib/subscriptionBrackets";

// Admin-only; enforced by the admin session check in src/middleware.ts for /api/admin/*.

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const brackets = await db
      .collection("subscriptionBrackets")
      .find({})
      .sort({ sortOrder: 1 })
      .toArray();
    return NextResponse.json({ success: true, brackets });
  } catch (error) {
    console.error("Error fetching subscription brackets:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch brackets" },
      { status: 500 },
    );
  }
}

/** A whole-rupee, strictly positive price. Anything else is a fat finger. */
function validPrice(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v < 100000;
}

/** A whole-number discount percent, 0–100 inclusive. */
function validDiscount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100;
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, vegPrice, nonVegPrice, vegDiscount, nonVegDiscount, label, proteinMin, proteinMax, active } = body;

    if (!isBracketKey(key)) {
      return NextResponse.json(
        { success: false, message: "Unknown bracket key" },
        { status: 400 },
      );
    }
    if (!validPrice(vegPrice) || !validPrice(nonVegPrice)) {
      return NextResponse.json(
        { success: false, message: "Prices must be positive whole rupees" },
        { status: 400 },
      );
    }
    // Discounts are optional; default to 0 when omitted.
    const vegDisc = vegDiscount === undefined ? 0 : vegDiscount;
    const nonVegDisc = nonVegDiscount === undefined ? 0 : nonVegDiscount;
    if (!validDiscount(vegDisc) || !validDiscount(nonVegDisc)) {
      return NextResponse.json(
        { success: false, message: "Discounts must be whole numbers from 0 to 100" },
        { status: 400 },
      );
    }

    const $set: Record<string, unknown> = {
      vegPrice,
      nonVegPrice,
      vegDiscount: vegDisc,
      nonVegDiscount: nonVegDisc,
      updatedAt: new Date(),
    };
    if (typeof label === "string" && label.trim()) $set.label = label.trim();
    if (typeof proteinMin === "number") $set.proteinMin = proteinMin;
    if (typeof proteinMax === "number") $set.proteinMax = proteinMax;
    if (typeof active === "boolean") $set.active = active;

    const { db } = await connectToDatabase();
    await db
      .collection("subscriptionBrackets")
      .updateOne({ key }, { $set, $setOnInsert: { key, createdAt: new Date() } }, { upsert: true });

    const bracket = await db.collection("subscriptionBrackets").findOne({ key });
    return NextResponse.json({ success: true, bracket });
  } catch (error) {
    console.error("Error updating subscription bracket:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update bracket" },
      { status: 500 },
    );
  }
}
