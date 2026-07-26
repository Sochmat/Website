import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  CATEGORIES_COLLECTION,
  RAW_MATERIALS_COLLECTION,
  escapeRegExp,
  listCategories,
} from "@/lib/inventoryDb";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*.

export const dynamic = "force-dynamic";

/**
 * Category list, seeding the defaults on first use.
 *
 * Each row carries `materialCount` so the management modal can show what a
 * category is used by, and disable delete on the ones still in use. The count
 * is computed here rather than in listCategories() — that helper runs on every
 * raw-material read and must stay cheap.
 */
export async function GET() {
  try {
    const categories = await listCategories();

    const { db } = await connectToDatabase();
    const counts = await db
      .collection(RAW_MATERIALS_COLLECTION)
      .aggregate([{ $group: { _id: "$categoryId", n: { $sum: 1 } } }])
      .toArray();
    const countById = new Map(
      counts.map((c) => [String(c._id), Number(c.n) || 0]),
    );

    return NextResponse.json(
      {
        success: true,
        categories: categories.map((c) => ({
          ...c,
          materialCount: countById.get(String(c._id)) ?? 0,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching inventory categories:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch categories" },
      { status: 500 },
    );
  }
}

/** Add a category. Names are unique case-insensitively. */
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
    const col = db.collection(CATEGORIES_COLLECTION);
    const clash = await col.findOne({
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: "That category already exists" },
        { status: 409 },
      );
    }

    const result = await col.insertOne({ name });
    return NextResponse.json({
      success: true,
      category: { _id: String(result.insertedId), name },
    });
  } catch (error) {
    console.error("Error creating inventory category:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create category" },
      { status: 500 },
    );
  }
}
