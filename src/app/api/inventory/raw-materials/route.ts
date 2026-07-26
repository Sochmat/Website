import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  RAW_MATERIALS_COLLECTION,
  listBrands,
  listCategories,
  listRawMaterials,
} from "@/lib/inventoryDb";
import { sanitizeRawMaterial } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*. Mirrors /api/admin/menu: fetch-based CRUD, a sanitize()
// gate on writes, no validation library.

export const dynamic = "force-dynamic";

/** List, filtered by `search` (name substring), `categoryId` and `brandId`. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const materials = await listRawMaterials({
      search: searchParams.get("search") ?? undefined,
      categoryId: searchParams.get("categoryId") ?? undefined,
      brandId: searchParams.get("brandId") ?? undefined,
    });
    return NextResponse.json(
      { success: true, materials },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching raw materials:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch raw materials" },
      { status: 500 },
    );
  }
}

/** Create one raw material. Names must stay unique by nameKey. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const [categories, brands] = await Promise.all([
      listCategories(),
      listBrands(),
    ]);
    const validIds = new Set(categories.map((c) => String(c._id)));
    const validBrandIds = new Set(brands.map((b) => String(b._id)));

    const { doc, error } = sanitizeRawMaterial(body, validIds, validBrandIds);
    if (error || !doc) {
      return NextResponse.json(
        { success: false, message: error ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const col = db.collection(RAW_MATERIALS_COLLECTION);

    // nameKey is the importer's upsert key, so a duplicate here would make a
    // later spreadsheet import ambiguous. Reject rather than create a twin.
    if (await col.findOne({ nameKey: doc.nameKey })) {
      return NextResponse.json(
        { success: false, message: "A raw material with that name already exists" },
        { status: 409 },
      );
    }

    const now = new Date();
    const result = await col.insertOne({
      ...doc,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({
      success: true,
      material: { ...doc, _id: String(result.insertedId) },
    });
  } catch (error) {
    console.error("Error creating raw material:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create raw material" },
      { status: 500 },
    );
  }
}
