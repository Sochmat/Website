import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { STOCK_AUDITS_COLLECTION, isValidId } from "@/lib/inventoryDb";
import type { AuditEntry, AuditLine } from "@/lib/stockAudits";

// Admin-only; enforced by the admin session check in src/middleware.ts.

export const dynamic = "force-dynamic";

/** One save, with the per-item lines the history drawer expands into. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid id" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    const doc = await db
      .collection(STOCK_AUDITS_COLLECTION)
      .findOne({ _id: new ObjectId(id) });

    if (!doc) {
      return NextResponse.json(
        { success: false, message: "Audit not found" },
        { status: 404 },
      );
    }

    const toLines = (value: unknown): AuditLine[] =>
      Array.isArray(value)
        ? value.map((l: Record<string, unknown>) => ({
            id: String(l?.id ?? ""),
            name: String(l?.name ?? ""),
            unit: String(l?.unit ?? ""),
            // null and undefined both mean "nothing was on record".
            previousStock:
              typeof l?.previousStock === "number" ? l.previousStock : null,
            closingStock: Number(l?.closingStock ?? 0),
            diff: typeof l?.diff === "number" ? l.diff : null,
            pctDiff: typeof l?.pctDiff === "number" ? l.pctDiff : null,
            addedQty: typeof l?.addedQty === "number" ? l.addedQty : null,
            consumedQty:
              typeof l?.consumedQty === "number" ? l.consumedQty : null,
            shortfall: typeof l?.shortfall === "number" ? l.shortfall : null,
            unitCost: typeof l?.unitCost === "number" ? l.unitCost : null,
            changeCost: typeof l?.changeCost === "number" ? l.changeCost : null,
          }))
        : [];

    const lines = toLines(doc.lines);
    const consumedLines = toLines(doc.consumedLines);

    const audit: AuditEntry = {
      _id: String(doc._id),
      kind: doc.kind === "production" ? "production" : "raw",
      // Records predating additions carry no type; they are all stock-takes.
      type: doc.type === "addition" ? "addition" : "audit",
      savedAt: new Date(doc.savedAt).toISOString(),
      savedByRole: String(doc.savedByRole ?? "admin"),
      rowCount: Number(doc.rowCount ?? lines.length),
      increases: Number(doc.increases ?? 0),
      decreases: Number(doc.decreases ?? 0),
      unchanged: Number(doc.unchanged ?? 0),
      firstCounts: Number(doc.firstCounts ?? 0),
      netCost: typeof doc.netCost === "number" ? doc.netCost : null,
      unvaluedRows: Number(doc.unvaluedRows ?? 0),
      consumedRows: Number(doc.consumedRows ?? consumedLines.length),
      lines,
      consumedLines,
    };

    return NextResponse.json(
      { success: true, audit },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching stock audit:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch audit" },
      { status: 500 },
    );
  }
}
