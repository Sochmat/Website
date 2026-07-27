import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { STOCK_AUDITS_COLLECTION } from "@/lib/inventoryDb";
import type { AuditKind, AuditSummary, AuditType } from "@/lib/stockAudits";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*.

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * Save history for one kind and type, newest first.
 *
 * Lines are deliberately projected out — a stock-take can run to hundreds of
 * rows, and the list only needs the headline counts. The detail endpoint
 * (`/stock-audits/[id]`) serves the lines for the one save being opened.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const kindParam = params.get("kind");
    const kind: AuditKind | null =
      kindParam === "raw" || kindParam === "production" ? kindParam : null;
    if (!kind) {
      return NextResponse.json(
        { success: false, message: "Unknown kind" },
        { status: 400 },
      );
    }

    const typeParam = params.get("type");
    const type: AuditType = typeParam === "addition" ? "addition" : "audit";

    const requested = Number(params.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const { db } = await connectToDatabase();
    const docs = await db
      .collection(STOCK_AUDITS_COLLECTION)
      .find(
        {
          kind,
          // Records written before additions existed carry no type; they are
          // all stock-takes.
          ...(type === "audit"
            ? { $or: [{ type: "audit" }, { type: { $exists: false } }] }
            : { type }),
        },
        { projection: { lines: 0 } },
      )
      .sort({ savedAt: -1 })
      .limit(limit)
      .toArray();

    const audits: AuditSummary[] = docs.map((d) => ({
      _id: String(d._id),
      kind,
      type,
      savedAt: new Date(d.savedAt).toISOString(),
      savedByRole: String(d.savedByRole ?? "admin"),
      rowCount: Number(d.rowCount ?? 0),
      increases: Number(d.increases ?? 0),
      decreases: Number(d.decreases ?? 0),
      unchanged: Number(d.unchanged ?? 0),
      firstCounts: Number(d.firstCounts ?? 0),
      // Records written before costing was captured have no figure at all,
      // which reads as "not valued" rather than "worth nothing".
      netCost: typeof d.netCost === "number" ? d.netCost : null,
      unvaluedRows: Number(d.unvaluedRows ?? 0),
      consumedRows: Number(d.consumedRows ?? 0),
    }));

    return NextResponse.json(
      { success: true, audits },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching stock audits:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch audit history" },
      { status: 500 },
    );
  }
}
