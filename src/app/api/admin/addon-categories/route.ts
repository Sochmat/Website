import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import type {
  AddOnCategory,
  AddOnCategoryMember,
  AddOnSelectionType,
} from "@/lib/types";

/**
 * CRUD for add-on categories — named groups of add-ons offered on many menu
 * items at once. Auth comes from the middleware gate on /api/admin.
 *
 * The group owns its mapping: it names the items (`itemIds`) and whole menu
 * categories (`menuCategoryIds`) it applies to, and menu items hold no
 * reference back. The member list is the display order within the group, so it
 * is stored (and returned) exactly as the editor sends it.
 *
 * Reordering the groups themselves is POST /api/admin/addon-categories/order.
 */

const COLLECTION = "addOnCategories";

/** Members arrive from the browser, so trust nothing: keep well-formed ids,
 *  drop the rest, let an absent/blank price mean "charge the add-on's own
 *  price" rather than storing a bogus 0, and keep at most one default. */
function sanitizeMembers(input: unknown): AddOnCategoryMember[] {
  if (!Array.isArray(input)) return [];
  const members: AddOnCategoryMember[] = [];
  let defaulted = false;
  for (const raw of input) {
    const addOnId = String(
      (raw as { addOnId?: unknown })?.addOnId ?? "",
    ).trim();
    if (!addOnId) continue;
    const rawPrice = (raw as { price?: unknown })?.price;
    const price =
      rawPrice === null || rawPrice === undefined || rawPrice === ""
        ? undefined
        : Number(rawPrice);
    // One default per category, whatever the browser sent: the sheet opens on
    // it, and two defaults would mean two different opening states.
    const defaultSelected =
      !defaulted && Boolean((raw as { defaultSelected?: unknown })?.defaultSelected);
    if (defaultSelected) defaulted = true;
    members.push({
      addOnId,
      ...(price !== undefined && Number.isFinite(price)
        ? { price: Math.max(0, price) }
        : {}),
      ...(defaultSelected ? { defaultSelected: true } : {}),
    });
  }
  return members;
}

/** Unknown types fall back to `add`, the behaviour every group had before
 *  types existed. */
function sanitizeSelectionType(input: unknown): AddOnSelectionType {
  return input === "single" || input === "multi" ? input : "add";
}

/** Ids from the browser: keep non-empty strings, drop blanks and duplicates. */
function sanitizeIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const ids = input.map((v) => String(v ?? "").trim()).filter(Boolean);
  return Array.from(new Set(ids));
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const categories = await db.collection(COLLECTION).find({}).toArray();
    return NextResponse.json({ success: true, categories });
  } catch (error) {
    console.error("Error fetching add-on categories:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch add-on categories" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const data = (await request.json()) as Partial<AddOnCategory>;
    const name = String(data.name ?? "").trim();

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Category name is required" },
        { status: 400 },
      );
    }

    // New groups go last in the global order, which is what the admin sees
    // happen when they add one.
    const last = await db
      .collection(COLLECTION)
      .find({}, { projection: { sortOrder: 1 } })
      .sort({ sortOrder: -1 })
      .limit(1)
      .toArray();
    const sortOrder = Number(last[0]?.sortOrder ?? -1) + 1;

    const category = {
      name,
      hidden: Boolean(data.hidden),
      required: Boolean(data.required),
      selectionType: sanitizeSelectionType(data.selectionType),
      members: sanitizeMembers(data.members),
      itemIds: sanitizeIds(data.itemIds),
      menuCategoryIds: sanitizeIds(data.menuCategoryIds),
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection(COLLECTION).insertOne(category);

    return NextResponse.json({
      success: true,
      category: { ...category, _id: result.insertedId },
    });
  } catch (error) {
    console.error("Error creating add-on category:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create add-on category" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { _id, ...data } = (await request.json()) as Partial<AddOnCategory> & {
      _id?: string;
    };

    if (!_id || !ObjectId.isValid(_id)) {
      return NextResponse.json(
        { success: false, message: "Valid category ID is required" },
        { status: 400 },
      );
    }

    // Only the fields the editor owns — a partial save must never wipe the
    // member list, so `members` is written only when it was actually sent.
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) {
      const name = String(data.name).trim();
      if (!name) {
        return NextResponse.json(
          { success: false, message: "Category name is required" },
          { status: 400 },
        );
      }
      update.name = name;
    }
    if (data.hidden !== undefined) update.hidden = Boolean(data.hidden);
    if (data.required !== undefined) update.required = Boolean(data.required);
    if (data.selectionType !== undefined) {
      update.selectionType = sanitizeSelectionType(data.selectionType);
    }
    if (data.members !== undefined) {
      update.members = sanitizeMembers(data.members);
    }
    if (data.itemIds !== undefined) update.itemIds = sanitizeIds(data.itemIds);
    if (data.menuCategoryIds !== undefined) {
      update.menuCategoryIds = sanitizeIds(data.menuCategoryIds);
    }

    const result = await db
      .collection(COLLECTION)
      .updateOne({ _id: new ObjectId(_id) }, { $set: update });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Add-on category not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating add-on category:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update add-on category" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Valid category ID is required" },
        { status: 400 },
      );
    }

    const result = await db
      .collection(COLLECTION)
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Add-on category not found" },
        { status: 404 },
      );
    }

    // Nothing to clean up on the item side: the group owned the mapping, so
    // deleting it is what unmaps it.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting add-on category:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete add-on category" },
      { status: 500 },
    );
  }
}
