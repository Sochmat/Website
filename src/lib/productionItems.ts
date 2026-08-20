// Production items — things the kitchen MAKES by combining raw materials.
//
// Pure logic only, mirroring src/lib/rawMaterials.ts: no Mongo, no Next, no
// ExcelJS. The same costing function runs on the server (to store the price)
// and in the browser (to show it live as the recipe is built), so the number
// the user sees before saving is the number that gets saved.

import { pricePerConsumptionUnit, type RawMaterial } from "./rawMaterials";
// Type-only for CostingMaterial in the other direction, so this pair of
// modules has no runtime cycle: itemRecipes only reaches rawMaterials at run
// time.
import { componentKey, type StockComponentType } from "./itemRecipes";

/**
 * One line of a recipe: how much of a component goes into a batch.
 *
 * A component is a raw material OR another production item — the kitchen
 * builds bases from bases, and a recipe that could only name raw materials
 * forced those intermediate steps to be re-typed into every item that used
 * them. Same shape as ItemRecipeLine, and keyed the same way, so the two
 * levels of recipe resolve components through identical code.
 *
 * Not a food item, though: a menu item is assembled from what the kitchen
 * makes, never the other way round. StockComponentType is what says so.
 */
export interface ProductionRecipeLine {
  refType: StockComponentType;
  refId: string;
  /** In the component's own consumptionUnit. */
  qtyUsed: number;
}

/**
 * Read one stored recipe line, tolerating the shape written before recipes
 * could name production items.
 *
 * Those documents carry `rawMaterialId` and no type at all; they are all raw
 * material, so that is what they read as. Normalising on read rather than
 * migrating keeps old and new documents working side by side — the same
 * approach the audit history takes to records written before it had a `type`.
 */
export function toRecipeLine(value: unknown): ProductionRecipeLine {
  const row = (value ?? {}) as {
    refType?: unknown;
    refId?: unknown;
    rawMaterialId?: unknown;
    qtyUsed?: unknown;
  };
  const legacyId = String(row.rawMaterialId ?? "");
  return {
    refType: row.refType === "production" ? "production" : "raw",
    refId: String(row.refId ?? "") || legacyId,
    qtyUsed: Number(row.qtyUsed ?? 0),
  };
}

/** A stored `recipe` array, normalized. Anything else reads as no recipe. */
export function toRecipeLines(value: unknown): ProductionRecipeLine[] {
  return Array.isArray(value) ? value.map(toRecipeLine) : [];
}

/**
 * Every production item reachable downward from `id` through its recipe.
 *
 * The loop guard for nested recipes: item X may not use component P when X is
 * among P's own dependencies, because each would then be made from the other.
 * `visited` also makes the walk safe over data that already contains a loop —
 * this must terminate even when the thing it is looking for is present.
 *
 * `id` itself is not included; a self-reference is checked directly by the
 * caller, which can say something clearer about it.
 */
export function productionDependencies(
  id: string,
  recipesById: ReadonlyMap<string, ProductionRecipeLine[]>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [id];

  while (queue.length > 0) {
    const current = queue.pop() as string;
    for (const line of recipesById.get(current) ?? []) {
      if (line.refType !== "production" || !line.refId) continue;
      if (seen.has(line.refId)) continue;
      seen.add(line.refId);
      queue.push(line.refId);
    }
  }

  return seen;
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
  /**
   * Made to order, never kept prepared in advance.
   *
   * An on-spot item holds no stock: there is no shelf of it to count, and
   * nothing to draw down when it sells. Whatever asks for it — a menu recipe or
   * another production item's recipe — is expanded THROUGH it, into the raw
   * material it is made from, scaled by batchYieldQty. See expandOnSpot.
   *
   * Absent means false, which is every item written before this existed and is
   * what the kitchen does with most of them: prepare a batch, keep it, sell
   * from it.
   */
  onSpot?: boolean;
  /** Not tracked yet — the Adjustment screen will maintain it. Absent means
   *  "stock unknown", which is different from zero. */
  currentStock?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Costing detail for one recipe line. */
export interface CostLine {
  refType: StockComponentType;
  refId: string;
  qtyUsed: number;
  /** Cost of one consumptionUnit of the component. */
  unitCost: number;
  /** qtyUsed × unitCost. */
  cost: number;
  /** Fraction of totalRecipeCost, 0–1. Zero when the total is zero. */
  share: number;
  /** False when the component has gone missing — costed as 0, flagged so
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
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
): CostBreakdown {
  const lines: CostLine[] = recipe.map((line) => {
    // A nested production item is priced by its own stored
    // pricePerPurchaseUnit and unitConversion, exactly as a raw material is —
    // the same two fields, so the same maths values either. Its price is read,
    // not re-derived here, which is what keeps this function non-recursive.
    const component = componentsByKey.get(componentKey(line.refType, line.refId));
    const unitCost = component ? pricePerConsumptionUnit(component) : 0;
    const qtyUsed = Number.isFinite(line.qtyUsed) ? line.qtyUsed : 0;
    return {
      refType: line.refType,
      refId: line.refId,
      qtyUsed,
      unitCost,
      cost: qtyUsed * unitCost,
      share: 0, // filled in below, once the total is known
      found: !!component,
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

/** How much of one component a quantity of a production item draws down. */
export interface ConsumedComponent {
  refType: StockComponentType;
  refId: string;
  /** In that component's consumptionUnit. */
  qty: number;
}

/**
 * Components consumed by producing `producedQty` of an item.
 *
 * A recipe yields `batchYieldQty` of the item (in its consumptionUnit) from
 * the listed quantities, so scaling is linear:
 *
 *   consumed = qtyUsed × (producedQty ÷ batchYieldQty)
 *
 * e.g. a recipe yielding 100 gm from 50 gm each of B and C, produced 100 gm,
 * consumes 50 gm of each.
 *
 * A nested production item is drawn down as itself, NOT expanded into the raw
 * material behind it: it is stocked in its own right, and its own ingredients
 * were already spent when its batch was recorded. Expanding here would deduct
 * the same ingredient twice — the same rule recipeDemand.ts follows one level
 * further up.
 *
 * Returns exact numbers — the caller decides how to round them. A zero or
 * missing batch yield cannot be scaled from, and a non-positive produced
 * quantity consumes nothing; both yield an empty list rather than Infinity or
 * a negative draw-down. Lines are summed per component, so a recipe naming the
 * same component twice draws down once.
 */
export function recipeConsumption(
  recipe: ProductionRecipeLine[],
  batchYieldQty: number,
  producedQty: number,
): ConsumedComponent[] {
  if (!Number.isFinite(batchYieldQty) || batchYieldQty <= 0) return [];
  if (!Number.isFinite(producedQty) || producedQty <= 0) return [];

  const factor = producedQty / batchYieldQty;
  const byComponent = new Map<string, ConsumedComponent>();

  for (const line of recipe) {
    const qtyUsed = Number.isFinite(line.qtyUsed) ? line.qtyUsed : 0;
    if (!line.refId || qtyUsed <= 0) continue;
    const key = componentKey(line.refType, line.refId);
    const existing = byComponent.get(key);
    if (existing) existing.qty += qtyUsed * factor;
    else {
      byComponent.set(key, {
        refType: line.refType,
        refId: line.refId,
        qty: qtyUsed * factor,
      });
    }
  }

  return [...byComponent.values()];
}

/** What expanding an on-spot item needs: its recipe, and what a batch yields. */
export interface OnSpotItem {
  recipe: ProductionRecipeLine[];
  batchYieldQty: number;
}

/** Demand with every on-spot item resolved away, and a note of which. */
export interface ExpandedDemand {
  /** Only things that sit on a shelf — what may actually be drawn down. */
  demand: ConsumedComponent[];
  /**
   * How much of each on-spot item was made, by id, at every depth reached.
   *
   * Nothing drew these down — there was no stock to take. They are reported
   * because "we made 750 gm of gravy to order today" is a real figure the
   * expansion is the only place that knows, and it is thrown away otherwise.
   */
  onSpotQty: Map<string, number>;
}

/**
 * Replace every on-spot production item in a demand with what it is made of.
 *
 * An on-spot item is prepared when the order lands, so there is no shelf of it
 * to draw down — the raw material goes straight from store to pan. Demand for
 * one is therefore not a draw-down at all but a pointer to its recipe, scaled
 * the way recipeConsumption scales one:
 *
 *   consumed = qtyUsed × (demanded ÷ batchYieldQty)
 *
 * This is the exact inverse of the rule for a stocked production item, and the
 * reason both are right is the same: spend the thing that actually sits on a
 * shelf. A stocked item IS that thing; an on-spot item never was.
 *
 * Runs as a pass over finished demand rather than inside either walk, so the
 * sale path and the production-run path get identical behaviour from one piece
 * of code — and neither has to know the rule exists.
 *
 * Expansion is recursive: an on-spot item made from another on-spot item
 * resolves all the way down to what is stocked. `seen` guards data that
 * already contains a loop; nothing can store one, but this must terminate
 * anyway. A looping item contributes nothing rather than recursing forever.
 *
 * An on-spot item with no usable recipe or batch yield expands to nothing —
 * the honest answer when we cannot know what it consumed, and the same one
 * recipeConsumption gives.
 */
export function expandOnSpot(
  demand: readonly ConsumedComponent[],
  onSpotById: ReadonlyMap<string, OnSpotItem>,
): ExpandedDemand {
  const totals = new Map<string, ConsumedComponent>();
  const onSpotQty = new Map<string, number>();

  const add = (refType: StockComponentType, refId: string, qty: number) => {
    const key = componentKey(refType, refId);
    const existing = totals.get(key);
    if (existing) existing.qty += qty;
    else totals.set(key, { refType, refId, qty });
  };

  const walk = (
    line: ConsumedComponent,
    ancestry: ReadonlySet<string>,
  ): void => {
    const onSpot =
      line.refType === "production" ? onSpotById.get(line.refId) : undefined;

    if (!onSpot) {
      add(line.refType, line.refId, line.qty);
      return;
    }
    if (ancestry.has(line.refId)) return;

    // Counted before the recipe is walked, so an item whose recipe yields
    // nothing usable is still reported as having been made — it was.
    onSpotQty.set(line.refId, (onSpotQty.get(line.refId) ?? 0) + line.qty);

    // recipeConsumption already does the scaling, the per-component summing and
    // the guards against a zero yield — reused rather than restated, so an
    // on-spot item consumes exactly what producing that much of it would.
    const inner = recipeConsumption(
      onSpot.recipe,
      onSpot.batchYieldQty,
      line.qty,
    );
    const deeper = new Set([...ancestry, line.refId]);
    for (const part of inner) walk(part, deeper);
  };

  for (const line of demand) walk(line, new Set());

  return { demand: [...totals.values()], onSpotQty };
}

export interface ProductionItemInput {
  name?: unknown;
  consumptionUnit?: unknown;
  purchaseUnit?: unknown;
  unitConversion?: unknown;
  batchYieldQty?: unknown;
  alertQty?: unknown;
  onSpot?: unknown;
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

function isStockComponentType(value: unknown): value is StockComponentType {
  return value === "raw" || value === "production";
}

/** The graph and identity a recipe needs to be checked for loops. */
export interface ProductionGraph {
  /**
   * The item being saved, when it already exists. A create has no id yet and
   * so cannot be part of a loop.
   */
  selfId?: string;
  /** Every production item's recipe, keyed by id — the loop is found in here. */
  recipesById?: ReadonlyMap<string, ProductionRecipeLine[]>;
}

/**
 * Validate a production item and derive its price.
 *
 * `componentsByKey` doubles as the set of valid components and the cost
 * source, so a recipe can't reference something that doesn't exist and the
 * price is always computed from the same data that validated it. It is keyed
 * `type:id`, so a raw material and a production item may share a name and an
 * id without ever being costed as each other.
 *
 * `graph` enables the loop check for nested production items. It is optional
 * because a caller that has no graph to check against (an importer resolving
 * names, say) still needs to validate everything else; passing nothing simply
 * skips that one rule.
 *
 * Returns the first error found, matching sanitizeRawMaterial's contract.
 */
export function sanitizeProductionItem(
  input: ProductionItemInput,
  componentsByKey: ReadonlyMap<string, CostingMaterial>,
  normalizeName: (name: string) => string,
  graph: ProductionGraph = {},
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
    return { error: "Add at least one component" };
  }

  const recipe: ProductionRecipeLine[] = [];
  const seen = new Set<string>();
  for (const entry of input.recipe) {
    const row = entry as {
      refType?: unknown;
      refId?: unknown;
      rawMaterialId?: unknown;
      qtyUsed?: unknown;
    };

    // A body written against the raw-material-only shape still means what it
    // always meant, so it is read rather than rejected.
    const refType: StockComponentType = isStockComponentType(row?.refType)
      ? row.refType
      : "raw";
    const refId =
      String(row?.refId ?? "").trim() ||
      String(row?.rawMaterialId ?? "").trim();
    if (!refId) return { error: "A recipe row has nothing selected" };

    const key = componentKey(refType, refId);
    if (!componentsByKey.has(key)) {
      return {
        error:
          refType === "production"
            ? "Unknown production item in recipe"
            : "Unknown raw material in recipe",
      };
    }
    // Two lines for one component would make the qty ambiguous and let the UI
    // and the stored total disagree.
    if (seen.has(key)) {
      return { error: "The same component is listed twice" };
    }
    seen.add(key);

    // A recipe that reaches back to the item it belongs to could never be
    // costed or produced: each side would be waiting on the other.
    if (refType === "production" && graph.selfId) {
      if (refId === graph.selfId) {
        return { error: "A production item cannot be made from itself" };
      }
      if (
        graph.recipesById &&
        productionDependencies(refId, graph.recipesById).has(graph.selfId)
      ) {
        return {
          error:
            "That production item is already made from this one — using it here would create a loop",
        };
      }
    }

    const qtyUsed = toNumber(row?.qtyUsed);
    if (qtyUsed === null) return { error: "Every recipe row needs a quantity" };
    if (qtyUsed <= 0) return { error: "Recipe quantities must be greater than 0" };

    recipe.push({ refType, refId, qtyUsed });
  }

  const { pricePerPurchaseUnit } = computeCost(
    recipe,
    batchYieldQty,
    unitConversion,
    componentsByKey,
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
      // Anything truthy off the wire is a checked box; absent is unchecked.
      // Always written, so clearing the box on an existing item really clears
      // it rather than leaving the old value in place under a $set.
      onSpot: input.onSpot === true || input.onSpot === "true",
      recipe,
      pricePerPurchaseUnit,
    },
  };
}
