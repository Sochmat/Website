import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import {
  RAW_MATERIALS_COLLECTION,
  UNITS_COLLECTION,
  escapeRegExp,
  listUnits,
} from "@/lib/inventoryDb";
import { normalizeUnitName, type UnitKind } from "@/lib/rawMaterials";

// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*. Mirrors ../brands — a small lookup table behind a dropdown.

export const dynamic = "force-dynamic";

function toKind(value: unknown): UnitKind | null {
  return value === "consumption" || value === "purchase" ? value : null;
}

/**
 * Unit names, optionally narrowed to one kind.
 *
 * Each row carries how many raw materials use it, so a list screen can say
 * what is safe to remove. Consumption and purchase units are counted against
 * their own field — "pcs" may be busy as one and unused as the other.
 */
export async function GET(request: NextRequest) {
  try {
    const kind = toKind(request.nextUrl.searchParams.get("kind"));
    const units = await listUnits(kind ?? undefined);

    const { db } = await connectToDatabase();
    const [consumptionCounts, purchaseCounts] = await Promise.all([
      db
        .collection(RAW_MATERIALS_COLLECTION)
        .aggregate([{ $group: { _id: "$consumptionUnit", n: { $sum: 1 } } }])
        .toArray(),
      db
        .collection(RAW_MATERIALS_COLLECTION)
        .aggregate([{ $group: { _id: "$purchaseUnit", n: { $sum: 1 } } }])
        .toArray(),
    ]);

    // Units are referenced by NAME on a material, not by id — the name is the
    // value the form stores. So the count is keyed by name, per kind.
    const countBy: Record<UnitKind, Map<string, number>> = {
      consumption: new Map(
        consumptionCounts.map((c) => [String(c._id), Number(c.n) || 0]),
      ),
      purchase: new Map(
        purchaseCounts.map((c) => [String(c._id), Number(c.n) || 0]),
      ),
    };

    return NextResponse.json(
      {
        success: true,
        units: units.map((unit) => ({
          ...unit,
          materialCount: countBy[unit.kind].get(unit.name) ?? 0,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error fetching inventory units:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch units" },
      { status: 500 },
    );
  }
}

/** Add a unit. Names are unique case-insensitively, within their own kind. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const kind = toKind(body?.kind);
    if (!kind) {
      return NextResponse.json(
        { success: false, message: "Unknown unit kind" },
        { status: 400 },
      );
    }

    const name = normalizeUnitName(String(body?.name ?? ""));
    if (!name) {
      return NextResponse.json(
        { success: false, message: "Name is required" },
        { status: 400 },
      );
    }

    const { db } = await connectToDatabase();
    // Seeds the defaults if this is the first touch, so a hand-added unit
    // never lands in an otherwise empty list.
    await listUnits(kind);

    const col = db.collection(UNITS_COLLECTION);
    const clash = await col.findOne({
      kind,
      name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" },
    });
    if (clash) {
      return NextResponse.json(
        { success: false, message: `"${String(clash.name)}" is already in the list` },
        { status: 409 },
      );
    }

    const result = await col.insertOne({ name, kind });
    return NextResponse.json({
      success: true,
      unit: { _id: String(result.insertedId), name, kind },
    });
  } catch (error) {
    console.error("Error creating inventory unit:", error);
    return NextResponse.json(
      { success: false, message: "Failed to add unit" },
      { status: 500 },
    );
  }
}
