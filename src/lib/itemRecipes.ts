// Item recipes — what a menu item is made of.
//
// Like a production item, but with no unit/yield bookkeeping of its own: an
// item recipe is just a name and a list of components, and its "costing" is
// the sum of those component costs. Components may be raw materials, production
// items, OR another item recipe — a combo is defined by the plates in it rather
// than by re-typing everything those plates are made of.
//
// Pure logic only, same contract as rawMaterials.ts and productionItems.ts.

import { pricePerConsumptionUnit } from "./rawMaterials";
import type { CostingMaterial } from "./productionItems";

/**
 * A component that is stocked in its own right, and so can be drawn down.
 *
 * Deliberately narrower than ComponentType: a production item's recipe may
 * only name these, and demand always resolves to these, so the compiler stops
 * an `item` from reaching either place.
 */
export type StockComponentType = "raw" | "production";

/**
 * Where a component comes from.
 *
 * `item` is another item recipe. It holds no stock of its own — it is a
 * definition — so it is expanded into what it is made of before anything is
 * deducted. See recipeDemand.ts.
 */
export type ComponentType = StockComponentType | "item";

export interface ItemRecipeLine {
  refType: ComponentType;
  refId: string;
  /**
   * In the component's own consumptionUnit; for an `item` line, a count of
   * whole portions — half a plate is a different recipe, not a fraction.
   */
  qtyUsed: number;
}

export interface ItemRecipe {
  _id?: string;
  name: string;
  nameKey: string;
  lines: ItemRecipeLine[];
  /** Derived from the lines — never entered by hand. */
  totalCost: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Composite key for a component.
 *
 * Raw materials and production items live in separate collections, so their
 * ids are only unique *within* a collection. Keying by type as well keeps a
 * production item from ever being costed as a raw material of the same id.
 */
export function componentKey(refType: ComponentType, refId: string): string {
  return `${refType}:${refId}`;
}

export function isComponentType(value: unknown): value is ComponentType {
  return value === "raw" || value === "production" || value === "item";
}

/**
 * Read one stored line.
 *
 * An unrecognised type reads as a raw material, which is what every line was
 * before the column existed — the same tolerance toRecipeLine() applies to
 * production recipes.
 */
export function toItemRecipeLine(value: unknown): ItemRecipeLine {
  const row = (value ?? {}) as {
    refType?: unknown;
    refId?: unknown;
    qtyUsed?: unknown;
  };
  return {
    refType: isComponentType(row.refType) ? row.refType : "raw",
    refId: String(row.refId ?? ""),
    qtyUsed: Number(row.qtyUsed ?? 0),
  };
}

/** A stored `lines` array, normalized. Anything else reads as no components. */
export function toItemRecipeLines(value: unknown): ItemRecipeLine[] {
  return Array.isArray(value) ? value.map(toItemRecipeLine) : [];
}

/**
 * Every item recipe reachable downward from `id` through its `item` lines.
 *
 * The loop guard: recipe X may not use recipe C when X is among C's own
 * dependencies, because each would then contain the other. `seen` also makes
 * the walk safe over data that already contains a loop — this must terminate
 * even when the thing it is looking for is present.
 *
 * `id` itself is not included; a self-reference is checked directly by the
 * caller, which can say something clearer about it. Mirrors
 * productionDependencies() one level up.
 */
export function itemRecipeDependencies(
  id: string,
  linesById: ReadonlyMap<string, readonly ItemRecipeLine[]>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [id];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const line of linesById.get(current) ?? []) {
      if (line.refType !== "item" || !line.refId) continue;
      if (seen.has(line.refId)) continue;
      seen.add(line.refId);
      queue.push(line.refId);
    }
  }

  return seen;
}

export interface ItemRecipeCostLine {
  refType: ComponentType;
  refId: string;
  qtyUsed: number;
  /** Cost of one consumptionUnit of the component. */
  unitCost: number;
  cost: number;
  /** Fraction of totalCost, 0–1. Zero when the total is zero. */
  share: number;
  found: boolean;
}

export interface ItemRecipeBreakdown {
  lines: ItemRecipeCostLine[];
  totalCost: number;
}

/** Money rounded to paise. */
function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** No item recipes to price against — the default for a recipe of raw lines. */
const NO_ITEM_COSTS: ReadonlyMap<string, number> = new Map();

/**
 * Cost an item recipe.
 *
 *   costOfLine = qtyUsed × (price ÷ unitConversion)
 *   totalCost  = Σ costOfLine
 *
 * The per-line formula is identical to production costing — a production item
 * used as a component is priced by its own pricePerPurchaseUnit and
 * unitConversion, exactly as a raw material is. There is no yield division
 * here, because an item recipe has no batch of its own.
 *
 * An `item` line is priced at its own total instead: one portion of it costs
 * what it costs to make. `itemCostsById` must therefore already be settled —
 * see itemRecipeCostsById(). Left out, every `item` line reads as missing,
 * which is what a caller that knows only raw materials should see.
 */
export function computeItemRecipeCost(
  lines: ItemRecipeLine[],
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
  itemCostsById: ReadonlyMap<string, number> = NO_ITEM_COSTS,
): ItemRecipeBreakdown {
  const costed: ItemRecipeCostLine[] = lines.map((line) => {
    const isItem = line.refType === "item";
    const component = isItem
      ? undefined
      : componentsByKey.get(componentKey(line.refType, line.refId));

    const found = isItem ? itemCostsById.has(line.refId) : !!component;
    const unitCost = isItem
      ? (itemCostsById.get(line.refId) ?? 0)
      : component
        ? pricePerConsumptionUnit(component)
        : 0;

    const qtyUsed = Number.isFinite(line.qtyUsed) ? line.qtyUsed : 0;
    return {
      refType: line.refType,
      refId: line.refId,
      qtyUsed,
      unitCost,
      cost: qtyUsed * unitCost,
      share: 0,
      found,
    };
  });

  const totalCost = costed.reduce((sum, l) => sum + l.cost, 0);
  for (const line of costed) {
    line.share = totalCost > 0 ? line.cost / totalCost : 0;
  }

  return { lines: costed, totalCost: roundCurrency(totalCost) };
}

/**
 * Every item recipe's cost, keyed by id, with nested recipes settled first.
 *
 * A recipe containing another is worth what its parts are worth *now*, so the
 * child is recomputed rather than read from its stored total — otherwise
 * editing a plate would leave every combo built on it quoting yesterday's
 * price until someone happened to re-save it.
 *
 * The child's cost is used rounded, which is the figure the screen shows for
 * one portion of it: a combo of two plates costs exactly twice what one plate
 * is displayed as, with no drift to explain.
 *
 * A loop is priced at zero rather than recursed into. Nothing can create one —
 * see sanitizeItemRecipe — but this must terminate on data that already has.
 */
export function itemRecipeCostsById(
  recipes: readonly ItemRecipe[],
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
): Map<string, number> {
  const linesById = new Map<string, ItemRecipeLine[]>();
  for (const recipe of recipes) {
    if (recipe._id) linesById.set(String(recipe._id), recipe.lines);
  }

  const costs = new Map<string, number>();
  const settling = new Set<string>();

  const settle = (id: string): number => {
    const known = costs.get(id);
    if (known !== undefined) return known;
    if (settling.has(id)) return 0;

    settling.add(id);
    const lines = linesById.get(id) ?? [];
    // Depth first: every nested recipe is in `costs` before this one is priced,
    // so the line below reads a settled figure rather than a missing one.
    for (const line of lines) {
      if (line.refType === "item" && line.refId) settle(line.refId);
    }
    settling.delete(id);

    const { totalCost } = computeItemRecipeCost(lines, componentsByKey, costs);
    costs.set(id, totalCost);
    return totalCost;
  };

  for (const id of linesById.keys()) settle(id);
  return costs;
}

export interface ItemRecipeInput {
  name?: unknown;
  lines?: unknown;
}

export type SanitizedItemRecipe = Omit<
  ItemRecipe,
  "_id" | "createdAt" | "updatedAt"
>;

export interface SanitizeItemRecipeResult {
  doc?: SanitizedItemRecipe;
  error?: string;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** What validating an `item` line needs: the other recipes, and who we are. */
export interface ItemRecipeGraph {
  /** Every stored recipe's lines, keyed by id — a loop is found in here. */
  linesById: ReadonlyMap<string, readonly ItemRecipeLine[]>;
  /** Every stored recipe's settled cost — see itemRecipeCostsById. */
  costsById: ReadonlyMap<string, number>;
  /**
   * The recipe being saved, when it already exists. It may not appear in its
   * own components, nor may anything that leads back to it.
   *
   * Left out by the importer, which checks loops across the whole batch: a
   * per-row graph cannot see the one a sheet is about to create, and would
   * reject a sheet that is in the middle of breaking an existing loop.
   */
  selfId?: string;
}

/**
 * Validate an item recipe and derive its cost.
 *
 * `componentsByKey` doubles as the set of valid components and the cost
 * source, so a line can't reference something that doesn't exist and the total
 * is always computed from the same data that validated it. `graph` does the
 * same job for `item` lines; without it, an item line has nothing to resolve
 * against and is refused.
 */
export function sanitizeItemRecipe(
  input: ItemRecipeInput,
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
  normalizeName: (name: string) => string,
  graph?: ItemRecipeGraph,
): SanitizeItemRecipeResult {
  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { error: "Name is required" };

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { error: "Add at least one component" };
  }

  const lines: ItemRecipeLine[] = [];
  const seen = new Set<string>();

  for (const entry of input.lines) {
    const row = entry as {
      refType?: unknown;
      refId?: unknown;
      qtyUsed?: unknown;
    };

    if (!isComponentType(row?.refType)) {
      return { error: "A component row has an unknown type" };
    }
    const refId = String(row?.refId ?? "").trim();
    if (!refId) return { error: "A component row has nothing selected" };

    const key = componentKey(row.refType, refId);
    if (row.refType === "item") {
      if (!graph?.linesById.has(refId)) {
        return { error: "Unknown food item in recipe" };
      }
      if (graph.selfId === refId) {
        return { error: "An item cannot be made from itself" };
      }
      if (
        graph.selfId &&
        itemRecipeDependencies(refId, graph.linesById).has(graph.selfId)
      ) {
        return {
          error:
            "That food item is already made from this one — using it here would create a loop",
        };
      }
    } else if (!componentsByKey.has(key)) {
      return {
        error:
          row.refType === "production"
            ? "Unknown production item in recipe"
            : "Unknown raw material in recipe",
      };
    }
    // Same component twice would make its quantity ambiguous.
    if (seen.has(key)) return { error: "The same component is listed twice" };
    seen.add(key);

    const qtyUsed = toNumber(row?.qtyUsed);
    if (qtyUsed === null) return { error: "Every component row needs a quantity" };
    if (qtyUsed <= 0) return { error: "Quantities must be greater than 0" };
    // A food item is counted in whole portions: there is no unit to take a
    // fraction of, and half a plate is its own recipe.
    if (row.refType === "item" && !Number.isInteger(qtyUsed)) {
      return { error: "A food item's quantity must be a whole number" };
    }

    lines.push({ refType: row.refType, refId, qtyUsed });
  }

  const { totalCost } = computeItemRecipeCost(
    lines,
    componentsByKey,
    graph?.costsById,
  );

  return {
    doc: { name, nameKey: normalizeName(name), lines, totalCost },
  };
}
