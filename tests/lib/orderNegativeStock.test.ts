// Selling a dish the kitchen does not have the stock for.
//
//   "Dal Thali" is mapped to  C (raw material, 200 gm)  +  B (production, 150 gm)
//   Both are sitting at 0.
//
// Delivering an order for it must take the quantities anyway and leave both in
// the red, because the food went out of the door. A shelf that stopped at zero
// would report the kitchen as square, and the next delivery would land on that
// false zero and quietly absorb the deficit.
//
// The whole order path runs here for real — componentDemand works out what the
// recipe calls for, spendComponentDemand takes it off the shelves — against a
// stub Db, which is the only dependency either of them has.

import { describe, expect, it } from "vitest";
import type { Db } from "mongodb";
import { componentDemand } from "@/lib/recipeDemand";
import { spendComponentDemand } from "@/lib/stockSpend";
import { drawDownStock } from "@/lib/inventoryDb";
import { recipeConsumption } from "@/lib/productionItems";
import { isBelowAlert } from "@/lib/rawMaterials";
import type { ItemRecipe } from "@/lib/itemRecipes";

const C = "cccccccccccccccccccccccc"; // raw material
const B = "bbbbbbbbbbbbbbbbbbbbbbbb"; // production item

const THALI: ItemRecipe = {
  _id: "recipe-1",
  name: "Dal Thali",
  nameKey: "dal thali",
  lines: [
    { refType: "raw", refId: C, qtyUsed: 200 },
    { refType: "production", refId: B, qtyUsed: 150 },
  ],
  totalCost: 0,
};

const RECIPES = new Map([["dal thali", THALI]]);

interface StoredRow {
  _id: string;
  name: string;
  consumptionUnit: string;
  /** Absent models an item nobody has ever counted. */
  currentStock?: number;
  pricePerPurchaseUnit: number;
  unitConversion: number;
  alertQty?: number;
  /** Made to order. Absent on every row here — these are all stocked items. */
  onSpot?: boolean;
}

function stubDb(collections: Record<string, StoredRow[]>) {
  const db = {
    collection(name: string) {
      const rows = collections[name] ?? [];
      return {
        /**
         * Two query shapes reach this stub: the draw-down's lookup by id, and
         * the made-to-order lookup that runs just before it. Nothing here is
         * on spot, so that one finds nothing and the demand is drawn down
         * exactly as it was built.
         */
        find(filter: {
          _id?: { $in: { toString(): string }[] };
          onSpot?: boolean;
        }) {
          if (!filter._id) {
            return {
              toArray: async () => rows.filter((r) => r.onSpot === true),
            };
          }
          const wanted = new Set(filter._id.$in.map((id) => id.toString()));
          return { toArray: async () => rows.filter((r) => wanted.has(r._id)) };
        },
        async bulkWrite(
          ops: {
            updateOne: {
              filter: { _id: { toString(): string } };
              update: { $inc: { currentStock: number } };
            };
          }[],
        ) {
          for (const op of ops) {
            const row = rows.find(
              (r) => r._id === op.updateOne.filter._id.toString(),
            );
            if (!row) continue;
            // $inc on an absent field starts it at the delta.
            row.currentStock =
              (row.currentStock ?? 0) + op.updateOne.update.$inc.currentStock;
          }
        },
      };
    },
  } as unknown as Db;

  return db;
}

/** Both shelves empty: C counted at 0, B counted at 0. */
function emptyShelves(): Record<string, StoredRow[]> {
  return {
    inventoryRawMaterials: [
      {
        _id: C,
        name: "C",
        consumptionUnit: "gm",
        currentStock: 0,
        pricePerPurchaseUnit: 90, // ₹0.09 per gm
        unitConversion: 1000,
        alertQty: 0, // no threshold set — the common case
      },
    ],
    inventoryProductionItems: [
      {
        _id: B,
        name: "B",
        consumptionUnit: "gm",
        currentStock: 0,
        pricePerPurchaseUnit: 120, // ₹0.12 per gm
        unitConversion: 1000,
        alertQty: 0,
      },
    ],
  };
}

/** Deliver an order for `quantity` thalis against the given shelves. */
async function sell(
  quantity: number,
  shelves: ReturnType<typeof emptyShelves>,
) {
  const { demand, unmapped } = componentDemand(
    [{ name: "Dal Thali", quantity }],
    RECIPES,
  );
  const spent = await spendComponentDemand(
    stubDb(shelves),
    demand,
    new Date("2026-07-31T00:00:00Z"),
  );
  return { spent, unmapped };
}

describe("ordering a dish the kitchen has no stock for", () => {
  it("takes both the raw material and the production item negative", async () => {
    const shelves = emptyShelves();
    const { spent, unmapped } = await sell(2, shelves);

    expect(unmapped).toEqual([]);
    // 2 thalis × 200 gm of C, and × 150 gm of B.
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-400);
    expect(shelves.inventoryProductionItems[0].currentStock).toBe(-300);
    expect(spent.rowCount).toBe(2);
  });

  it("reports both as short by exactly what could not be covered", async () => {
    const { spent } = await sell(2, emptyShelves());
    expect(spent.shortfallRows).toBe(2);
    expect(spent.rawLines[0].shortfall).toBe(400);
    expect(spent.productionLines[0].shortfall).toBe(300);
  });

  it("shows the debt on the closing figure, not just in the history", async () => {
    const { spent } = await sell(2, emptyShelves());
    expect(spent.rawLines[0].closingStock).toBe(-400);
    expect(spent.productionLines[0].closingStock).toBe(-300);
  });

  it("flags both as low even with no alert threshold set", async () => {
    const shelves = emptyShelves();
    await sell(2, shelves);
    // Below zero is below any threshold worth setting, so the stock screens
    // surface it without anyone having configured an alert qty.
    expect(isBelowAlert(shelves.inventoryRawMaterials[0].currentStock, 0)).toBe(
      true,
    );
    expect(
      isBelowAlert(shelves.inventoryProductionItems[0].currentStock, 0),
    ).toBe(true);
  });

  it("values the whole draw-down, not just the part that was covered", async () => {
    const { spent } = await sell(2, emptyShelves());
    // 400 gm × ₹0.09 = ₹36, plus 300 gm × ₹0.12 = ₹36.
    expect(spent.rawLines[0].changeCost).toBe(-36);
    expect(spent.productionLines[0].changeCost).toBe(-36);
    expect(spent.netCost).toBe(-72);
  });

  it("goes further into the red on the next order", async () => {
    const shelves = emptyShelves();
    await sell(2, shelves);
    await sell(1, shelves);
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-600);
    expect(shelves.inventoryProductionItems[0].currentStock).toBe(-450);
  });

  it("blames a later order only for its own share of the shortfall", async () => {
    const shelves = emptyShelves();
    await sell(2, shelves); // C is now at −400
    const { spent } = await sell(1, shelves);
    // The second order consumed 200 gm and covered none of it — the earlier
    // 400 gm of debt is not this order's shortfall to report.
    expect(spent.rawLines[0].shortfall).toBe(200);
  });

  it("lets a delivery pay the debt off rather than landing on a false zero", async () => {
    const shelves = emptyShelves();
    await sell(2, shelves); // C at −400
    // Receiving 500 gm settles the 400 owed and leaves 100 genuinely on hand.
    shelves.inventoryRawMaterials[0].currentStock! += 500;
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(100);
  });

  it("starts an item nobody ever counted at the negative it now owes", async () => {
    const shelves = emptyShelves();
    shelves.inventoryRawMaterials[0].currentStock = undefined;
    const { spent } = await sell(1, shelves);
    expect(spent.rawLines[0].previousStock).toBeNull(); // never counted
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-200);
  });

  it("does NOT reach through a production item into its raw material", async () => {
    // B is made from C. Selling the thali spends B as itself and leaves C
    // alone: C is spent when B's own batch is recorded, and taking it here as
    // well would deduct the same ingredient twice. See the block below for
    // where C's share actually lands.
    const shelves = emptyShelves();
    const { spent } = await sell(2, shelves);
    // C moved only by its own 200 gm line on the recipe, not by B's 150 gm.
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-400);
    expect(spent.rawLines).toHaveLength(1);
  });

  it("partly covers what it can before going negative", async () => {
    const shelves = emptyShelves();
    shelves.inventoryRawMaterials[0].currentStock = 250;
    const { spent } = await sell(2, shelves); // wants 400
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-150);
    expect(spent.rawLines[0].shortfall).toBe(150);
  });
});

/**
 * Where a production item's raw material lands when the item is SOLD without
 * ever having been recorded as produced.
 *
 * Selling P takes P negative. Its raw material R does not move, because R is
 * spent when P's batch is recorded, not when P is sold. The negative on P is
 * precisely the record that a batch is owed — and recording that batch is what
 * moves R. The pair is self-settling; nothing is lost, it is just carried on P
 * until the production is entered.
 */
describe("a production item sold before it was ever produced", () => {
  const R = "dddddddddddddddddddddddd"; // raw material behind P
  const P = "eeeeeeeeeeeeeeeeeeeeeeee"; // production item, sold from empty

  /** P yields 100 gm per batch from 100 gm of R. Both start empty. */
  function kitchen(): Record<string, StoredRow[]> {
    return {
      inventoryRawMaterials: [
        {
          _id: R,
          name: "R",
          consumptionUnit: "gm",
          currentStock: 0,
          pricePerPurchaseUnit: 90,
          unitConversion: 1000,
        },
      ],
      inventoryProductionItems: [
        {
          _id: P,
          name: "P",
          consumptionUnit: "gm",
          currentStock: 0,
          pricePerPurchaseUnit: 120,
          unitConversion: 1000,
        },
      ],
    };
  }

  const DISH: ItemRecipe = {
    _id: "recipe-2",
    name: "Dish",
    nameKey: "dish",
    lines: [{ refType: "production", refId: P, qtyUsed: 150 }],
    totalCost: 0,
  };

  /** Deliver an order for `quantity` dishes. */
  const sellDish = (quantity: number, shelves: Record<string, StoredRow[]>) =>
    spendComponentDemand(
      stubDb(shelves),
      componentDemand(
        [{ name: "Dish", quantity }],
        new Map([["dish", DISH]]),
      ).demand,
      new Date("2026-07-31T00:00:00Z"),
    );

  /** Record producing `qty` of P on the Add Stock screen. */
  async function produceP(qty: number, shelves: Record<string, StoredRow[]>) {
    // The addition itself, as the route's $inc applies it.
    const item = shelves.inventoryProductionItems[0];
    item.currentStock = (item.currentStock ?? 0) + qty;
    // Then the recipe is spent: 100 gm of R per 100 gm batch.
    const owed = new Map<string, number>();
    for (const consumed of recipeConsumption(
      [{ refType: "raw", refId: R, qtyUsed: 100 }],
      100,
      qty,
    )) {
      owed.set(consumed.refId, consumed.qty);
    }
    return drawDownStock(
      stubDb(shelves),
      "inventoryRawMaterials",
      owed,
      new Date("2026-07-31T00:00:00Z"),
    );
  }

  it("takes P negative and leaves R untouched", async () => {
    const shelves = kitchen();
    await sellDish(2, shelves); // 2 × 150 gm of P
    expect(shelves.inventoryProductionItems[0].currentStock).toBe(-300);
    // R has not moved: no batch of P has been recorded yet, so nothing of R
    // has been spent yet either.
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(0);
  });

  it("settles both once the owed batch is recorded", async () => {
    const shelves = kitchen();
    await sellDish(2, shelves); // P: −300, R: 0

    // Entering the 300 gm of P that was actually made clears P's debt and
    // spends R for it — which is where R's negative comes from.
    await produceP(300, shelves);

    expect(shelves.inventoryProductionItems[0].currentStock).toBe(0);
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-300);
  });

  it("keeps R in step when the batch is recorded before the sale", async () => {
    // The ordinary order of events, for comparison: R goes negative at
    // production time and P never dips below zero.
    const shelves = kitchen();
    await produceP(300, shelves);
    expect(shelves.inventoryProductionItems[0].currentStock).toBe(300);
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-300);

    await sellDish(2, shelves);
    expect(shelves.inventoryProductionItems[0].currentStock).toBe(0);
    expect(shelves.inventoryRawMaterials[0].currentStock).toBe(-300);
  });

  it("lands on the same figures whichever order the two are entered in", async () => {
    const soldFirst = kitchen();
    await sellDish(2, soldFirst);
    await produceP(300, soldFirst);

    const madeFirst = kitchen();
    await produceP(300, madeFirst);
    await sellDish(2, madeFirst);

    expect(soldFirst.inventoryProductionItems[0].currentStock).toBe(
      madeFirst.inventoryProductionItems[0].currentStock,
    );
    expect(soldFirst.inventoryRawMaterials[0].currentStock).toBe(
      madeFirst.inventoryRawMaterials[0].currentStock,
    );
  });
});
