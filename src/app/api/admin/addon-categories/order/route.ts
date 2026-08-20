import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

/**
 * Rewrite the global order of the add-on categories.
 *
 * There is one order for all of them, shared by every item: the menu item no
 * longer holds the list of groups it offers, so it cannot order them itself.
 * The admin sets it with the arrow buttons, which send the whole list back.
 */
export async function POST(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const { ids } = (await request.json()) as { ids?: unknown };

    if (!Array.isArray(ids)) {
      return NextResponse.json(
        { success: false, message: "An ordered list of ids is required" },
        { status: 400 },
      );
    }

    const valid = ids
      .map((id) => String(id ?? "").trim())
      .filter((id) => ObjectId.isValid(id));

    if (valid.length !== ids.length) {
      return NextResponse.json(
        { success: false, message: "Invalid category id in the order" },
        { status: 400 },
      );
    }

    // Position in the array is the order — sent whole, so a partial write can
    // only ever leave a gap, never a duplicate position.
    await Promise.all(
      valid.map((id, index) =>
        db
          .collection("addOnCategories")
          .updateOne(
            { _id: new ObjectId(id) },
            { $set: { sortOrder: index, updatedAt: new Date() } },
          ),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering add-on categories:", error);
    return NextResponse.json(
      { success: false, message: "Failed to reorder add-on categories" },
      { status: 500 },
    );
  }
}
