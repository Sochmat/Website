// The nested-production scenario, end to end through the real functions:
//
//   A (production)  is made from  B (production, 200 gm)  +  C (raw, 50 gm)
//   B (production)  is made from  C (raw, 100 gm)
//
// Producing A must draw B off the production shelf and C off the raw one, each
// scaled by how much A was made. B must NOT be expanded into its own C — that
// was already spent when B's own batch was recorded.
//
// drawDownStock takes its Db as an argument, so the real deduction runs here
// against a stub collection rather than a database.

import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { drawDownStock } from "./inventoryDb";
import { recipeConsumption, type ProductionRecipeLine } from "./productionItems";

const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const C = "cccccccccccccccccccccccc";

/** A's recipe: 200 gm of production item B, 50 gm of raw material C. */
const A_RECIPE: ProductionRecipeLine[] = [
  { refType: "production", refId: B, qtyUsed: 200 },
  { refType: "raw", refId: C, qtyUsed: 50 },
];
/** B's own recipe, which producing A must NOT reach into. */
const B_RECIPE: ProductionRecipeLine[] = [
  { refType: "raw", refId: C, qtyUsed: 100 },
];

const A_BATCH_YIELD = 100;

/** Stored rows, keyed by collection name, as the stub Db serves them. */
interface StoredRow {
  _id: string;
  name: string;
  consumptionUnit: string;
  currentStock: number;
  pricePerPurchaseUnit: number;
  unitConversion: number;
}

/**
 * Enough of a Db for drawDownStock: a find that filters `_id.$in`, and a
 * bulkWrite that applies the `$inc` delta onto the rows. Writes are recorded
 * so a test can assert which collection was touched.
 */
function stubDb(collections: Record<string, StoredRow[]>) {
  const writes: { collection: string; id: string; currentStock: number }[] = [];

  const db = {
    collection(name: string) {
      const rows = collections[name] ?? [];
      return {
        find(filter: { _id: { $in: { toString(): string }[] } }) {
          const wanted = new Set(filter._id.$in.map((id) => id.toString()));
          return {
            toArray: async () => rows.filter((r) => wanted.has(r._id)),
          };
        },
        // drawDownStock writes an atomic $inc, so the stub applies the delta
        // rather than assigning a computed figure.
        async bulkWrite(
          ops: {
            updateOne: {
              filter: { _id: { toString(): string } };
              update: { $inc: { currentStock: number } };
            };
          }[],
        ) {
          for (const op of ops) {
            const id = op.updateOne.filter._id.toString();
            const row = rows.find((r) => r._id === id);
            if (!row) continue;
            row.currentStock += op.updateOne.update.$inc.currentStock;
            writes.push({
              collection: name,
              id,
              currentStock: row.currentStock,
            });
          }
        },
      };
    },
  } as unknown as Db;

  return { db, writes };
}

function freshShelves() {
  return {
    inventoryProductionItems: [
      {
        _id: B,
        name: "B",
        consumptionUnit: "gm",
        currentStock: 5000,
        pricePerPurchaseUnit: 120, // ₹0.12 per gm
        unitConversion: 1000,
      },
    ],
    inventoryRawMaterials: [
      {
        _id: C,
        name: "C",
        consumptionUnit: "gm",
        currentStock: 10000,
        pricePerPurchaseUnit: 90, // ₹0.09 per gm
        unitConversion: 1000,
      },
    ],
  };
}

/**
 * What the Add Stock route does with a production save: work out what the
 * recipe owes, split it by which shelf it comes off, then draw each down.
 */
async function produce(producedQty: number) {
  const shelves = freshShelves();
  const { db, writes } = stubDb(shelves);

  const owed = { raw: new Map<string, number>(), production: new Map<string, number>() };
  for (const consumed of recipeConsumption(A_RECIPE, A_BATCH_YIELD, producedQty)) {
    const bucket = owed[consumed.refType];
    bucket.set(consumed.refId, (bucket.get(consumed.refId) ?? 0) + consumed.qty);
  }

  const at = new Date("2026-07-31T00:00:00Z");
  const production = await drawDownStock(
    db,
    "inventoryProductionItems",
    owed.production,
    at,
  );
  const raw = await drawDownStock(db, "inventoryRawMaterials", owed.raw, at);

  return { shelves, writes, production, raw, owed };
}

describe("producing A draws down both B and C", () => {
  it("owes B and C, each scaled by how much A was produced", async () => {
    // 250 gm of A from a 100 gm batch = ×2.5.
    const { owed } = await produce(250);
    expect(owed.production.get(B)).toBe(500); // 200 × 2.5
    expect(owed.raw.get(C)).toBe(125); // 50 × 2.5
  });

  it("takes B off the production shelf and C off the raw shelf", async () => {
    const { shelves, writes } = await produce(250);

    expect(shelves.inventoryProductionItems[0].currentStock).toBe(4500); // 5000 − 500
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(9875); // 10000 − 125

    // Each landed on its own collection, not both on one.
    expect(writes).toEqual([
      { collection: "inventoryProductionItems", id: B, currentStock: 4500 },
      { collection: "inventoryRawMaterials", id: C, currentStock: 9875 },
    ]);
  });

  it("does NOT also charge C for B's own recipe", async () => {
    const { shelves } = await produce(250);
    // If B were expanded, C would lose its own 125 plus 500 gm for the 500 gm
    // of B (100 gm of C per 100 gm batch) — landing at 9375 instead.
    const expandedWrongly =
      10000 -
      125 -
      recipeConsumption(B_RECIPE, 100, 500).reduce((sum, l) => sum + l.qty, 0);
    expect(expandedWrongly).toBe(9375);
    expect(shelves.inventoryRawMaterials[0].currentStock).not.toBe(9375);
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(9875);
  });

  it("scales both draw-downs linearly with the quantity produced", async () => {
    const one = await produce(100); // exactly one batch
    expect(one.shelves.inventoryProductionItems[0].currentStock).toBe(4800); // −200
    expect(one.shelves.inventoryRawMaterials[0].currentStock).toBe(9950); // −50

    const ten = await produce(1000); // ten batches
    expect(ten.shelves.inventoryProductionItems[0].currentStock).toBe(3000); // −2000
    expect(ten.shelves.inventoryRawMaterials[0].currentStock).toBe(9500); // −500
  });

  it("records a history line for each, priced at its own rate", async () => {
    const { production, raw } = await produce(250);

    expect(production).toHaveLength(1);
    expect(production[0].name).toBe("B");
    expect(production[0].consumedQty).toBe(500);
    expect(production[0].previousStock).toBe(5000);
    expect(production[0].closingStock).toBe(4500);
    expect(production[0].changeCost).toBe(-60); // 500 × ₹0.12

    expect(raw).toHaveLength(1);
    expect(raw[0].name).toBe("C");
    expect(raw[0].consumedQty).toBe(125);
    expect(raw[0].closingStock).toBe(9875);
    expect(raw[0].changeCost).toBe(-11.25); // 125 × ₹0.09
  });

  it("goes negative on an over-draw and reports the shortfall", async () => {
    // 3000 gm of A wants 6000 gm of B, but only 5000 is on the shelf. The
    // batch was still made, so B is left owing 1000 gm.
    const { shelves, production } = await produce(3000);
    expect(shelves.inventoryProductionItems[0].currentStock).toBe(-1000);
    expect(production[0].shortfall).toBe(1000);
  });

  it("draws nothing when there is no batch yield to scale from", async () => {
    const shelves = freshShelves();
    const { db, writes } = stubDb(shelves);
    const owed = new Map<string, number>();
    for (const consumed of recipeConsumption(A_RECIPE, 0, 250)) {
      owed.set(consumed.refId, consumed.qty);
    }
    await drawDownStock(db, "inventoryProductionItems", owed, new Date());
    expect(writes).toEqual([]);
    expect(shelves.inventoryProductionItems[0].currentStock).toBe(5000);
  });
});
