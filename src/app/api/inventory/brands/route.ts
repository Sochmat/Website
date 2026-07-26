import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  BRANDS_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  escapeRegExp,
  listBrands,
} from "@/lib/inventoryDb";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*. Mirrors ../categories — brands differ only in being
// optional on a material and never seeded.

export const dynamic = "force-dynamic";

/** Brand list, each row carrying how many raw materials reference it. */
export async function GET() {
  try {
    const brands = await listBrands();

    const { db } = await connectToDatabase();
    const counts = await db
      .collection(RAW_MATERIALS_COLLECTION)
      .aggregate([{ $group: { _id: "$brandId", n: { $sum: 1 } } }])
      .toArray();
    const countById = new Map(
      counts.map((c) => [String(c._id), Number(c.n) || 0]),
    );

    return NextResponse.json(
      {
        success: true,
        brands: brands.map((b) => ({
          ...b,
          materialCount: countById.get(String(b._id)) ?? 0,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching inventory brands:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch brands" },
      { status: 500 },
    );
  }
}

/** Add a brand. Names are unique case-insensitively. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body?.name ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (!name) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(BRANDS_COLLECTION);
    const clash = await col.findOne({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: "That brand already exists" },
        { status: 409 },
      );
    }

    const result = await col.insertOne({ name });
    return NextResponse.json({
      success: true,
      brand: { _id: String(result.insertedId), name },
    });
  } catch (error) {
    console.error("Error creating inventory brand:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create brand" },
      { status: 500 },
    );
  }
}
