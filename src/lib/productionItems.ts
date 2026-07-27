// Production items — things the kitchen MAKES by combining raw materials.
//
// Pure logic only, mirroring src/lib/rawMaterials.ts: no Mongo, no Next, no
// ExcelJS. The same costing function runs on the server (to store the price)
// and in the browser (to show it live as the recipe is built), so the number
// the user sees before saving is the number that gets saved.

import { pricePerConsumptionUnit, type RawMaterial } from "./rawMaterials";

/** One line of a recipe: how much of a raw material goes into a batch. */
export interface ProductionRecipeLine {
  rawMaterialId: string;
  /** In that raw material's consumptionUnit. */
  qtyUsed: number;
}

export interface ProductionItem {
  _id?: string;
  name: string;
  /** normalizeMaterialName(name) — keeps names unique the same way. */
  nameKey: string;
  /** Unit this item is consumed in downstream, e.g. gm. */
  consumptionUnit: string;
  /** Unit this item is tracked/sold in, e.g. kg. */
  purchaseUnit: string;
  /** How many consumptionUnits make one purchaseUnit. */
  unitConversion: number;
  /** How much of THIS item one batch of the recipe yields, in consumptionUnit. */
  batchYieldQty: number;
  recipe: ProductionRecipeLine[];
  /** Derived from the recipe — never entered by hand. See computeCost. */
  pricePerPurchaseUnit: number;
  /** Optional low-stock threshold, in consumptionUnit. 0 = none set. */
  alertQty?: number;
  /** Not tracked yet — the Adjustment screen will maintain it. Absent means
   *  "stock unknown", which is different from zero. */
  currentStock?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Costing detail for one recipe line. */
export interface CostLine {
  rawMaterialId: string;
  qtyUsed: number;
  /** Cost of one consumptionUnit of the raw material. */
  unitCost: number;
  /** qtyUsed × unitCost. */
  cost: number;
  /** Fraction of totalRecipeCost, 0–1. Zero when the total is zero. */
  share: number;
  /** False when the raw material has gone missing — costed as 0, flagged so
   *  the UI can say so rather than showing a silently wrong total. */
  found: boolean;
}

export interface CostBreakdown {
  lines: CostLine[];
  totalRecipeCost: number;
  /** totalRecipeCost ÷ batchYieldQty. */
  costPerConsumptionUnit: number;
  /** costPerConsumptionUnit × unitConversion — the stored price. */
  pricePerPurchaseUnit: number;
}

/** Money rounded to paise. Keeps stored prices free of float drift. */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** The subset of a raw material costing needs. */
export type CostingMaterial = Pick<
  RawMaterial,
  "pricePerPurchaseUnit" | "unitConversion"
>;

/**
 * Cost a recipe.
 *
 *   costOfLine  = qtyUsed × (rawPrice ÷ rawUnitConversion)
 *   totalCost   = Σ costOfLine
 *   costPerUnit = totalCost ÷ batchYieldQty
 *   price       = costPerUnit × unitConversion
 *
 * Every division is guarded: a zero batch yield or unit conversion yields 0
 * rather than Infinity/NaN, because the form calls this on every keystroke and
 * a half-typed number must not produce a garbage price.
 */
export function computeCost(
  recipe: ProductionRecipeLine[],
  batchYieldQty: number,
  unitConversion: number,
  materialsById: ReadonlyMap<string, CostingMaterial>,
): CostBreakdown {
  const lines: CostLine[] = recipe.map((line) => {
    const material = materialsById.get(line.rawMaterialId);
    const unitCost = material ? pricePerConsumptionUnit(material) : 0;
    const qtyUsed = Number.isFinite(line.qtyUsed) ? line.qtyUsed : 0;
    return {
      rawMaterialId: line.rawMaterialId,
      qtyUsed,
      unitCost,
      cost: qtyUsed * unitCost,
      share: 0, // filled in below, once the total is known
      found: !!material,
    };
  });

  const totalRecipeCost = lines.reduce((sum, l) => sum + l.cost, 0);
  for (const line of lines) {
    line.share = totalRecipeCost > 0 ? line.cost / totalRecipeCost : 0;
  }

  const yieldQty = Number.isFinite(batchYieldQty) ? batchYieldQty : 0;
  const conversion = Number.isFinite(unitConversion) ? unitConversion : 0;
  const costPerConsumptionUnit =
    yieldQty > 0 ? totalRecipeCost / yieldQty : 0;

  return {
    lines,
    totalRecipeCost,
    costPerConsumptionUnit,
    pricePerPurchaseUnit: roundCurrency(costPerConsumptionUnit * conversion),
  };
}

/** How much of one raw material a quantity of a production item draws down. */
export interface ConsumedMaterial {
  rawMaterialId: string;
  /** In that raw material's consumptionUnit. */
  qty: number;
}

/**
 * Raw material consumed by producing `producedQty` of an item.
 *
 * A recipe yields `batchYieldQty` of the item (in its consumptionUnit) from
 * the listed quantities, so scaling is linear:
 *
 *   consumed = qtyUsed × (producedQty ÷ batchYieldQty)
 *
 * e.g. a recipe yielding 100 gm from 50 gm each of B and C, produced 100 gm,
 * consumes 50 gm of each.
 *
 * Returns exact numbers — the caller decides how to round them. A zero or
 * missing batch yield cannot be scaled from, and a non-positive produced
 * quantity consumes nothing; both yield an empty list rather than Infinity or
 * a negative draw-down. Lines are summed per material, so a recipe naming the
 * same material twice draws down once.
 */
export function recipeConsumption(
  recipe: ProductionRecipeLine[],
  batchYieldQty: number,
  producedQty: number,
): ConsumedMaterial[] {
  if (!Number.isFinite(batchYieldQty) || batchYieldQty <= 0) return [];
  if (!Number.isFinite(producedQty) || producedQty <= 0) return [];

  const factor = producedQty / batchYieldQty;
  const byMaterial = new Map<string, number>();

  for (const line of recipe) {
    const qtyUsed = Number.isFinite(line.qtyUsed) ? line.qtyUsed : 0;
    if (!line.rawMaterialId || qtyUsed <= 0) continue;
    byMaterial.set(
      line.rawMaterialId,
      (byMaterial.get(line.rawMaterialId) ?? 0) + qtyUsed * factor,
    );
  }

  return [...byMaterial].map(([rawMaterialId, qty]) => ({ rawMaterialId, qty }));
}

export interface ProductionItemInput {
  name?: unknown;
  consumptionUnit?: unknown;
  purchaseUnit?: unknown;
  unitConversion?: unknown;
  batchYieldQty?: unknown;
  alertQty?: unknown;
  recipe?: unknown;
}

export type SanitizedProductionItem = Omit<
  ProductionItem,
  "_id" | "createdAt" | "updatedAt" | "currentStock"
>;

export interface SanitizeProductionResult {
  doc?: SanitizedProductionItem;
  error?: string;
}

/** Accepts "1,000" and " 12.5 "; rejects "" and "abc". */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate a production item and derive its price.
 *
 * `materialsById` doubles as the set of valid raw-material ids and the cost
 * source, so a recipe can't reference something that doesn't exist and the
 * price is always computed from the same data that validated it.
 *
 * Returns the first error found, matching sanitizeRawMaterial's contract.
 */
export function sanitizeProductionItem(
  input: ProductionItemInput,
  materialsById: ReadonlyMap<string, CostingMaterial>,
  normalizeName: (name: string) => string,
): SanitizeProductionResult {
  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { error: "Name is required" };

  const consumptionUnit = String(input.consumptionUnit ?? "").trim();
  if (!consumptionUnit) return { error: "Consumption unit is required" };

  const purchaseUnit = String(input.purchaseUnit ?? "").trim();
  if (!purchaseUnit) return { error: "Purchase unit is required" };

  const unitConversion = toNumber(input.unitConversion);
  if (unitConversion === null) return { error: "Unit conversion is required" };
  if (unitConversion <= 0) {
    return { error: "Unit conversion must be greater than 0" };
  }

  const batchYieldQty = toNumber(input.batchYieldQty);
  if (batchYieldQty === null) return { error: "Batch yield qty is required" };
  if (batchYieldQty <= 0) {
    return { error: "Batch yield qty must be greater than 0" };
  }

  // Optional: a blank threshold simply means "don't flag this item".
  const alertRaw = toNumber(input.alertQty);
  const alertQty = alertRaw === null ? 0 : alertRaw;
  if (alertQty < 0) return { error: "Alert qty cannot be negative" };

  if (!Array.isArray(input.recipe) || input.recipe.length === 0) {
    return { error: "Add at least one raw material" };
  }

  const recipe: ProductionRecipeLine[] = [];
  const seen = new Set<string>();
  for (const entry of input.recipe) {
    const row = entry as { rawMaterialId?: unknown; qtyUsed?: unknown };
    const rawMaterialId = String(row?.rawMaterialId ?? "").trim();
    if (!rawMaterialId) return { error: "A recipe row has no raw material" };
    if (!materialsById.has(rawMaterialId)) {
      return { error: "Unknown raw material in recipe" };
    }
    // Two lines for one material would make the qty ambiguous and let the UI
    // and the stored total disagree.
    if (seen.has(rawMaterialId)) {
      return { error: "The same raw material is listed twice" };
    }
    seen.add(rawMaterialId);

    const qtyUsed = toNumber(row?.qtyUsed);
    if (qtyUsed === null) return { error: "Every recipe row needs a quantity" };
    if (qtyUsed <= 0) return { error: "Recipe quantities must be greater than 0" };

    recipe.push({ rawMaterialId, qtyUsed });
  }

  const { pricePerPurchaseUnit } = computeCost(
    recipe,
    batchYieldQty,
    unitConversion,
    materialsById,
  );

  return {
    doc: {
      name,
      nameKey: normalizeName(name),
      consumptionUnit,
      purchaseUnit,
      unitConversion,
      batchYieldQty,
      alertQty,
      recipe,
      pricePerPurchaseUnit,
    },
  };
}
