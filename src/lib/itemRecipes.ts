// Item recipes — what a menu item is made of.
//
// Like a production item, but with no unit/yield bookkeeping of its own: an
// item recipe is just a name and a list of components, and its "costing" is
// the sum of those component costs. Components may be raw materials OR
// production items, so a recipe can build on something the kitchen makes.
//
// Pure logic only, same contract as rawMaterials.ts and productionItems.ts.

import { pricePerConsumptionUnit } from "./rawMaterials";
import type { CostingMaterial } from "./productionItems";

/** Where a component comes from. */
export type ComponentType = "raw" | "production";

export interface ItemRecipeLine {
  refType: ComponentType;
  refId: string;
  /** In the component's own consumptionUnit. */
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
 */
export function computeItemRecipeCost(
  lines: ItemRecipeLine[],
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
): ItemRecipeBreakdown {
  const costed: ItemRecipeCostLine[] = lines.map((line) => {
    const component = componentsByKey.get(
      componentKey(line.refType, line.refId),
    );
    const unitCost = component ? pricePerConsumptionUnit(component) : 0;
    const qtyUsed = Number.isFinite(line.qtyUsed) ? line.qtyUsed : 0;
    return {
      refType: line.refType,
      refId: line.refId,
      qtyUsed,
      unitCost,
      cost: qtyUsed * unitCost,
      share: 0,
      found: !!component,
    };
  });

  const totalCost = costed.reduce((sum, l) => sum + l.cost, 0);
  for (const line of costed) {
    line.share = totalCost > 0 ? line.cost / totalCost : 0;
  }

  return { lines: costed, totalCost: roundCurrency(totalCost) };
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

function isComponentType(value: unknown): value is ComponentType {
  return value === "raw" || value === "production";
}

/**
 * Validate an item recipe and derive its cost.
 *
 * `componentsByKey` doubles as the set of valid components and the cost
 * source, so a line can't reference something that doesn't exist and the total
 * is always computed from the same data that validated it.
 */
export function sanitizeItemRecipe(
  input: ItemRecipeInput,
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
  normalizeName: (name: string) => string,
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
    if (!componentsByKey.has(key)) {
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

    lines.push({ refType: row.refType, refId, qtyUsed });
  }

  const { totalCost } = computeItemRecipeCost(lines, componentsByKey);

  return {
    doc: { name, nameKey: normalizeName(name), lines, totalCost },
  };
}
