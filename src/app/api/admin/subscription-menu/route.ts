import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { isBracketKey } from "@/lib/subscriptionBrackets";
import { normalizeName } from "@/lib/subscriptionImport";
import type { SubscriptionMenuItem } from "@/lib/types";

// Admin-only; enforced by the admin session check in src/middleware.ts for /api/admin/*.
// Mirrors /api/admin/menu: fetch-based CRUD, no server actions, no validation library.
//
// Unlike the customer endpoint, GET here DOES return `referencePrice` — admins need
// it for margin work. `importKey` is never writable from the UI: it is the importer's
// immutable upsert key, and letting an admin change it would re-duplicate the row on
// the next spreadsheet import.

const NUMERIC_FIELDS = ["protein", "kcal", "fiber", "carbs", "referencePrice", "sortOrder"] as const;

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const items = await db
      .collection("subscriptionMenuItems")
      .find({})
      .sort({ bracket: 1, isVeg: -1, sortOrder: 1 })
      .toArray();
    return NextResponse.json({ success: true, items });
  } catch (error) {
    console.error("Error fetching subscription menu items:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch items" },
      { status: 500 },
    );
  }
}

/** Never contains `_id`, `importKey` or `source` — see the note at the top of the file. */
type ItemDoc = Omit<SubscriptionMenuItem, "_id" | "importKey" | "source" | "createdAt" | "updatedAt">;

interface Sanitized {
  doc: ItemDoc;
  error?: string;
}

function sanitize(data: Record<string, unknown>): Sanitized {
  const empty = {} as ItemDoc;
  const name = String(data.name ?? "").trim();
  if (!name) return { doc: empty, error: "Name is required" };
  if (!isBracketKey(data.bracket)) return { doc: empty, error: "Unknown bracket" };

  const doc: Record<string, unknown> = {
    name,
    nameKey: normalizeName(name), // always recomputed server-side
    bracket: data.bracket,
    description: String(data.description ?? ""),
    image: String(data.image ?? ""),
    isVeg: data.isVeg === true,
    hidden: data.hidden === true,
    ingredients: Array.isArray(data.ingredients)
      ? data.ingredients.map(String).filter(Boolean)
      : [],
  };
  for (const f of NUMERIC_FIELDS) {
    doc[f] = Number(data[f]) || 0;
  }
  return { doc: doc as unknown as ItemDoc };
}

/** (bracket, nameKey) must stay unique or the admin list grows confusing twins. */
async function duplicateExists(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"],
  bracket: string,
  nameKey: string,
  excludeId?: string,
) {
  const filter: Record<string, unknown> = { bracket, nameKey };
  if (excludeId) filter._id = { $ne: new ObjectId(excludeId) };
  return (await db.collection("subscriptionMenuItems").countDocuments(filter)) > 0;
}

export async function POST(request: NextRequest) {
  try {
    const { doc, error } = sanitize(await request.json());
    if (error) return NextResponse.json({ success: false, message: error }, { status: 400 });

    const { db } = await connectToDatabase();
    if (await duplicateExists(db, doc.bracket!, doc.nameKey!)) {
      return NextResponse.json(
        { success: false, message: `"${doc.name}" already exists in this bracket` },
        { status: 409 },
      );
    }

    const now = new Date();
    // `doc` carries no _id (sanitize builds it field by field), so Mongo mints one.
    const result = await db
      .collection<ItemDoc>("subscriptionMenuItems")
      .insertOne({ ...doc, source: "admin", createdAt: now, updatedAt: now } as ItemDoc);

    return NextResponse.json({ success: true, item: { ...doc, _id: result.insertedId } });
  } catch (error) {
    console.error("Error creating subscription menu item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create item" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const _id = String(data._id ?? "");
    if (!ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: "Valid item ID is required" },
        { status: 400 },
      );
    }

    const { doc, error } = sanitize(data);
    if (error) return NextResponse.json({ success: false, message: error }, { status: 400 });

    const { db } = await connectToDatabase();
    if (await duplicateExists(db, doc.bracket!, doc.nameKey!, _id)) {
      return NextResponse.json(
        { success: false, message: `"${doc.name}" already exists in this bracket` },
        { status: 409 },
      );
    }

    // `importKey` and `source` are deliberately absent from `doc`, so this $set
    // can never disturb the importer's identity for the row.
    const result = await db
      .collection("subscriptionMenuItems")
      .updateOne({ _id: new ObjectId(_id) }, { $set: { ...doc, updatedAt: new Date() } });

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating subscription menu item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update item" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Valid item ID is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const result = await db
      .collection("subscriptionMenuItems")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting subscription menu item:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete item" },
      { status: 500 },
    );
  }
}
