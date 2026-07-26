import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  PRODUCTION_ITEMS_COLLECTION,
  costingMaterialsById,
  listProductionItems,
} from "@/lib/inventoryDb";
import { sanitizeProductionItem } from "@/lib/productionItems";
import { normalizeMaterialName } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*.

export const dynamic = "force-dynamic";

/** List, optionally filtered by `search` (name substring). */
export async function GET(request: NextRequest) {
  try {
    const items = await listProductionItems(
      request.nextUrl.searchParams.get("search") ?? undefined,
    );
    return NextResponse.json(
      { success: true, items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching production items:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch production items" },
      { status: 500 },
    );
  }
}

/**
 * Create a production item.
 *
 * The price is never taken from the request — sanitizeProductionItem derives
 * it from the recipe and the current raw-material prices, so a stale or
 * doctored client value can't be stored.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const materials = await costingMaterialsById();

    const { doc, error } = sanitizeProductionItem(
      body,
      materials,
      normalizeMaterialName,
    );
    if (error || !doc) {
      return NextResponse.json(
        { success: false, message: error ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(PRODUCTION_ITEMS_COLLECTION);

    if (await col.findOne({ nameKey: doc.nameKey })) {
      return NextResponse.json(
        { success: false, message: "A production item with that name already exists" },
        { status: 409 },
      );
    }

    const now = new Date();
    const result = await col.insertOne({ ...doc, createdAt: now, updatedAt: now });
    return NextResponse.json({
      success: true,
      item: { ...doc, _id: String(result.insertedId) },
    });
  } catch (error) {
    console.error("Error creating production item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create production item" },
      { status: 500 },
    );
  }
}
