import { NextRequest, NextResponse } from "next/server";
import {
  componentCostsByKey,
  productionDepsByNameKey,
  productionItemIdsByNameKey,
  rawMaterialIdsByNameKey,
} from "@/lib/inventoryDb";
import { parseProductionWorkbook } from "@/lib/recipeSheet";
import { planProductionImport } from "@/lib/recipeImport";

// Admin-only; enforced by the admin session check in src/middleware.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generous for a production-item list, small enough that a stray 200MB file
// can't tie up the server parsing it.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Parse an uploaded .xlsx and return what *would* happen — nothing is written.
 *
 * The client shows this as the preview screen and posts the plan back to
 * ../bulk to commit. The commit endpoint re-validates from scratch, so the
 * plan returned here is a convenience, not a trusted token.
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, message: "No file uploaded" },
        { status: 400 },
      );
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, message: "File is larger than 5 MB" },
        { status: 413 },
      );
    }

    const { itemRows, recipeRows, error } = await parseProductionWorkbook(
      await file.arrayBuffer(),
    );
    if (error) {
      return NextResponse.json({ success: false, message: error }, { status: 400 });
    }
    if (itemRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "That sheet has no data rows" },
        { status: 400 },
      );
    }

    const [materialIds, productionIds, componentsByKey, storedDeps] =
      await Promise.all([
        rawMaterialIdsByNameKey(),
        productionItemIdsByNameKey(),
        componentCostsByKey(),
        productionDepsByNameKey(),
      ]);
    // productionIds serves twice: the set of items a recipe line may name, and
    // the map that reconciles an existing item to update.
    const plan = planProductionImport(
      itemRows,
      recipeRows,
      materialIds,
      productionIds,
      productionIds,
      componentsByKey,
      storedDeps,
    );

    return NextResponse.json({
      success: true,
      summary: {
        total: itemRows.length,
        toCreate: plan.creates.length,
        toUpdate: plan.updates.length,
        errors: plan.errors.length,
      },
      creates: plan.creates,
      updates: plan.updates,
      errors: plan.errors,
    });
  } catch (error) {
    console.error("Error parsing production item import:", error);
    return NextResponse.json(
      { success: false, message: "Failed to read that file" },
      { status: 500 },
    );
  }
}
