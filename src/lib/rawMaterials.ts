// Raw-material master for the inventory console.
//
// Pure logic only — no Mongo, no Next, no ExcelJS. The IO halves live in
// src/app/api/inventory/**. Keeping the validation and import reconciliation
// here means both the single-record form and the spreadsheet importer run the
// exact same rules, and the rules are unit-testable (see rawMaterials.test.ts).

/** Categories are a tiny lookup table so materials can be filtered by them. */
export interface RawMaterialCategory {
  _id?: string;
  name: string;
  /** How many raw materials reference it. Only populated by the categories
   *  endpoint — absent everywhere the count isn't needed. */
  materialCount?: number;
}

/** Seeded on first read when the collection is empty. Extend freely — the
 *  admin can also add categories at runtime, so this is only a starting set. */
export const DEFAULT_CATEGORIES = [
  "Vegetables",
  "Dairy",
  "Grains",
  "Spices",
  "Packaging",
] as const;

/**
 * Which of a material's two units a unit name is offered for.
 *
 * They are kept apart because they mean different things: you buy in kg and
 * consume in gm, and offering "kg" as a consumption unit would invite the
 * conversion to be entered backwards. A name may legitimately appear in both
 * lists ("pcs"), which is why this is a scope rather than a property of the
 * name itself.
 */
export type UnitKind = "consumption" | "purchase";

export interface InventoryUnit {
  _id?: string;
  name: string;
  kind: UnitKind;
  /** How many raw materials use it. Only populated by the units endpoint. */
  materialCount?: number;
}

/**
 * Seeded on first read, so the dropdowns open with exactly what they offered
 * when the lists were hard-coded. The set is a starting point — units are
 * added from the raw-material form as the kitchen needs them.
 */
export const DEFAULT_CONSUMPTION_UNITS = ["gm", "ml", "pcs"] as const;
export const DEFAULT_PURCHASE_UNITS = [
  "kg",
  "litre",
  "box",
  "packet",
  "pcs",
] as const;

/** Same normalization brands and categories use, for uniqueness checks. */
export function normalizeUnitName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Brands are the same shape as categories but are NOT seeded — there is no
 * sensible default set, and they are optional on a material besides.
 */
export interface RawMaterialBrand {
  _id?: string;
  name: string;
  /** How many raw materials reference it. Only populated by the brands
   *  endpoint — absent everywhere the count isn't needed. */
  materialCount?: number;
}

export interface RawMaterial {
  _id?: string;
  name: string;
  /** normalizeMaterialName(name). The upsert key for spreadsheet imports. */
  nameKey: string;
  categoryId: string;
  /** Resolved from categoryId by the API on read; never stored. */
  categoryName?: string;
  /** Optional — plenty of ingredients are unbranded. "" means none. */
  brandId?: string;
  /** Resolved from brandId by the API on read; never stored. */
  brandName?: string;
  /** Unit a recipe consumes this in — gm, ml, pcs. */
  consumptionUnit: string;
  /** Unit it is bought in — kg, litre, box. */
  purchaseUnit: string;
  /** How many consumptionUnits make one purchaseUnit (1 kg = 1000 gm). */
  unitConversion: number;
  pricePerPurchaseUnit: number;
  /** Low-stock threshold, expressed in consumptionUnit. */
  alertQty: number;
  /** Not tracked yet — the Adjustment screen will maintain it. Absent means
   *  "stock unknown", which is different from zero. */
  currentStock?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Column headers for the export/template spreadsheet, in order. */
export const SHEET_COLUMNS = [
  "Name",
  "Category",
  "Brand",
  "Consumption Unit",
  "Purchase Unit",
  "Unit Conversion",
  "Price per Purchase Unit",
  "Alert Qty",
] as const;

/**
 * Columns an uploaded sheet must actually contain. Brand is excluded: it is
 * optional on a material, so spreadsheets written before brands existed must
 * keep importing cleanly rather than failing on a missing header.
 */
export const REQUIRED_SHEET_COLUMNS = SHEET_COLUMNS.filter(
  (c) => c !== "Brand",
);

/**
 * Matching key for a material name. Same normalization as the subscription
 * importer: case- and whitespace-insensitive, trailing punctuation dropped, so
 * "Toor Dal ", "toor  dal" and "Toor Dal." all reconcile to one record.
 */
export function normalizeMaterialName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,]+$/, "")
    .trim();
}

/** "1 kg = 1000 gm" — the human-readable form of the conversion factor. */
export function formatUnitConversion(
  material: Pick<
    RawMaterial,
    "purchaseUnit" | "unitConversion" | "consumptionUnit"
  >,
): string {
  const factor = material.unitConversion.toLocaleString("en-IN");
  return `1 ${material.purchaseUnit} = ${factor} ${material.consumptionUnit}`;
}

/** Indian-format currency, e.g. ₹1,250.50. */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

/** Price of a single consumptionUnit, derived from the purchase price. */
export function pricePerConsumptionUnit(
  material: Pick<RawMaterial, "pricePerPurchaseUnit" | "unitConversion">,
): number {
  if (!material.unitConversion) return 0;
  return material.pricePerPurchaseUnit / material.unitConversion;
}

/**
 * Low-stock test, shared by raw materials and production items.
 *
 * An absent `currentStock` means *unknown*, which must NOT read as "0 and
 * therefore critical" — untracked rows show the threshold with no badge. An
 * absent or zero `alertQty` means no threshold was set, so nothing can be
 * below it — except a negative quantity, which is always flagged.
 */
export function isBelowAlert(
  currentStock: number | undefined,
  alertQty: number | undefined,
): boolean {
  if (typeof currentStock !== "number") return false;
  // Below zero is below any threshold worth setting, and it is the state that
  // most needs looking at: stock went out that the books did not have. Checked
  // before alertQty so an item with no threshold — the common case now that
  // one is optional — still surfaces when it goes into the red.
  if (currentStock < 0) return true;
  if (typeof alertQty !== "number" || alertQty <= 0) return false;
  return currentStock <= alertQty;
}

/** Low-stock test for a raw material. */
export function isLowStock(material: RawMaterial): boolean {
  return isBelowAlert(material.currentStock, material.alertQty);
}

/** Parsed from a form body or a spreadsheet row, before validation. */
export interface RawMaterialInput {
  name?: unknown;
  categoryId?: unknown;
  brandId?: unknown;
  consumptionUnit?: unknown;
  purchaseUnit?: unknown;
  unitConversion?: unknown;
  pricePerPurchaseUnit?: unknown;
  alertQty?: unknown;
}

export type SanitizedRawMaterial = Omit<
  RawMaterial,
  "_id" | "categoryName" | "brandName" | "createdAt" | "updatedAt" | "currentStock"
>;

export interface SanitizeResult {
  doc?: SanitizedRawMaterial;
  error?: string;
}

/** Accepts "1,000" and " 12.5 " as numbers; rejects "" and "abc". */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Validate one raw material. `validCategoryIds` / `validBrandIds` are the sets
 * of ids that exist, so an unknown reference is rejected rather than silently
 * stored.
 *
 * Brand is optional — blank means "unbranded", which is the common case. It
 * defaults to an empty set so a caller that forgets to pass it fails closed
 * (rejecting a brand) rather than open (storing an unvalidated id).
 *
 * Returns the first error found — the form surfaces one message at a time, and
 * the importer reports it per row.
 */
export function sanitizeRawMaterial(
  input: RawMaterialInput,
  validCategoryIds: ReadonlySet<string>,
  validBrandIds: ReadonlySet<string> = new Set(),
): SanitizeResult {
  // Collapse internal whitespace runs as well as trimming: a spreadsheet cell
  // reading "TOOR  DAL" should not store a double space as the display name.
  // Capitalisation is left alone — that is the user's choice, spacing is not.
  const name = String(input.name ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return { error: "Name is required" };

  const categoryId = String(input.categoryId ?? "").trim();
  if (!categoryId) return { error: "Category is required" };
  if (!validCategoryIds.has(categoryId)) return { error: "Unknown category" };

  const brandId = String(input.brandId ?? "").trim();
  if (brandId && !validBrandIds.has(brandId)) return { error: "Unknown brand" };

  const consumptionUnit = String(input.consumptionUnit ?? "").trim();
  if (!consumptionUnit) return { error: "Consumption unit is required" };

  const purchaseUnit = String(input.purchaseUnit ?? "").trim();
  if (!purchaseUnit) return { error: "Purchase unit is required" };

  const unitConversion = toNumber(input.unitConversion);
  if (unitConversion === null) return { error: "Unit conversion is required" };
  if (unitConversion <= 0) {
    return { error: "Unit conversion must be greater than 0" };
  }

  const pricePerPurchaseUnit = toNumber(input.pricePerPurchaseUnit);
  if (pricePerPurchaseUnit === null) return { error: "Price is required" };
  if (pricePerPurchaseUnit < 0) return { error: "Price cannot be negative" };

  // Optional: a blank threshold simply means "don't flag this material", the
  // same as it means on a production item. 0 is what isBelowAlert reads as no
  // threshold set, so a blank cell and an explicit 0 land in the same place.
  const alertRaw = toNumber(input.alertQty);
  const alertQty = alertRaw === null ? 0 : alertRaw;
  if (alertQty < 0) return { error: "Alert qty cannot be negative" };

  return {
    doc: {
      name,
      nameKey: normalizeMaterialName(name),
      categoryId,
      // Always present so an edit that clears the brand actually unsets it,
      // rather than leaving the previous value behind on a $set.
      brandId,
      consumptionUnit,
      purchaseUnit,
      unitConversion,
      pricePerPurchaseUnit,
      alertQty,
    },
  };
}

/** One spreadsheet row, keyed by SHEET_COLUMNS header text. */
export type SheetRow = Record<string, unknown>;

export interface ImportRowError {
  /** 1-indexed row number in the sheet, header included — matches what the
   *  user sees in Excel, so the error report is actionable. */
  rowNumber: number;
  name: string;
  message: string;
}

/**
 * A planned row, carrying the lookup NAMES its sheet gave alongside the ids.
 *
 * A category or brand the sheet introduces has no id yet — it is created when
 * the import is committed. The name is what survives the round trip through
 * the browser, so the commit resolves ids from these rather than trusting the
 * placeholder ids the preview issued.
 */
export type PlannedRawMaterial = SanitizedRawMaterial & {
  categoryName: string;
  /** "" when the sheet left Brand blank — unbranded is normal. */
  brandName: string;
};

/** A unit name the sheet introduced, and which of the two fields used it. */
export interface PlannedUnit {
  name: string;
  kind: UnitKind;
}

export interface ImportPlan {
  creates: PlannedRawMaterial[];
  /** Existing `_id` plus the new field values. */
  updates: (PlannedRawMaterial & { _id: string })[];
  errors: ImportRowError[];
  /** Category names the sheet introduces, in first-seen order. */
  newCategories: string[];
  /** Brand names the sheet introduces. */
  newBrands: string[];
  /** Unit names the sheet introduces, per kind. */
  newUnits: PlannedUnit[];
}

/**
 * Stand-in id for a lookup the sheet introduces.
 *
 * The row still has to validate at preview time, which means presenting an id
 * that is in the valid set — but the real id does not exist until the commit
 * creates the record. This marker satisfies the check and is replaced by name
 * on commit; it is never stored.
 */
export function pendingLookupId(name: string): string {
  return `pending:${name.toLowerCase()}`;
}

/** Unit lists the importer checks against, to spot the ones it must add. */
export interface KnownUnits {
  consumption: ReadonlySet<string>;
  purchase: ReadonlySet<string>;
}

/**
 * Reconcile parsed sheet rows against what's already stored.
 *
 * Matching is by normalized name (there is no stable id in the sheet), so a
 * renamed material imports as a new record rather than silently rewriting an
 * unrelated one.
 *
 * Categories, brands and units arrive as NAMES. A name the console has not
 * seen before is added to its list rather than failing the row: a sheet is how
 * a kitchen describes what it actually buys, and making someone pre-create
 * every category before their spreadsheet will load is busywork that produces
 * no different an outcome. What is new is reported on the plan, so the preview
 * can say what the import will add before anything is written.
 *
 * Duplicate names *within one sheet* are an error on the later row — otherwise
 * the last one silently wins and the user never learns their sheet was wrong.
 */
export function planImport(
  rows: SheetRow[],
  categoryIdsByName: ReadonlyMap<string, string>,
  existingIdsByNameKey: ReadonlyMap<string, string>,
  brandIdsByName: ReadonlyMap<string, string> = new Map(),
  knownUnits: KnownUnits = { consumption: new Set(), purchase: new Set() },
): ImportPlan {
  const plan: ImportPlan = {
    creates: [],
    updates: [],
    errors: [],
    newCategories: [],
    newBrands: [],
    newUnits: [],
  };
  const validCategoryIds = new Set(categoryIdsByName.values());
  const validBrandIds = new Set(brandIdsByName.values());
  const seenInSheet = new Set<string>();

  // Lowercased name -> display name, so "TOOR DAL" and "Toor Dal" in one sheet
  // add a single category rather than two that differ only in case.
  const pendingCategories = new Map<string, string>();
  const pendingBrands = new Map<string, string>();
  const pendingUnits = new Map<string, PlannedUnit>();

  /** Resolve a lookup name to an id, queueing it for creation if it is new. */
  const resolveLookup = (
    name: string,
    known: ReadonlyMap<string, string>,
    pending: Map<string, string>,
    validIds: Set<string>,
  ): string => {
    const existing = known.get(name.toLowerCase());
    if (existing) return existing;
    const id = pendingLookupId(name);
    if (!pending.has(name.toLowerCase())) pending.set(name.toLowerCase(), name);
    // The placeholder has to pass sanitize's existence check — the real id is
    // assigned when the commit creates the record.
    validIds.add(id);
    return id;
  };

  /** Queue a unit for creation if this kind's list does not have it yet. */
  const notePendingUnit = (raw: unknown, kind: UnitKind) => {
    const name = normalizeUnitName(String(raw ?? ""));
    if (!name) return;
    if (knownUnits[kind].has(name.toLowerCase())) return;
    const key = `${kind}:${name.toLowerCase()}`;
    if (!pendingUnits.has(key)) pendingUnits.set(key, { name, kind });
  };

  rows.forEach((row, index) => {
    // +2: one for the header row, one to make it 1-indexed like Excel.
    const rowNumber = index + 2;
    const rawName = String(row["Name"] ?? "").trim();

    // A blank Category is still an error — that is a row that forgot to say
    // what it is, not a row introducing a new category.
    const categoryName = String(row["Category"] ?? "").trim();
    const categoryId = categoryName
      ? resolveLookup(
          categoryName,
          categoryIdsByName,
          pendingCategories,
          validCategoryIds,
        )
      : "";

    // Brand is optional, so a blank cell is fine; a name the console has not
    // seen is added rather than failing the row.
    const brandName = String(row["Brand"] ?? "").trim();
    const brandId = brandName
      ? resolveLookup(brandName, brandIdsByName, pendingBrands, validBrandIds)
      : "";

    const { doc, error } = sanitizeRawMaterial(
      {
        name: rawName,
        categoryId,
        brandId,
        consumptionUnit: row["Consumption Unit"],
        purchaseUnit: row["Purchase Unit"],
        unitConversion: row["Unit Conversion"],
        pricePerPurchaseUnit: row["Price per Purchase Unit"],
        alertQty: row["Alert Qty"],
      },
      validCategoryIds,
      validBrandIds,
    );

    if (error || !doc) {
      plan.errors.push({
        rowNumber,
        name: rawName,
        message: error ?? "Invalid row",
      });
      return;
    }

    // Only after the row has validated: a row that is going to be rejected
    // must not drag a new category into existence with it.
    notePendingUnit(doc.consumptionUnit, "consumption");
    notePendingUnit(doc.purchaseUnit, "purchase");

    if (seenInSheet.has(doc.nameKey)) {
      plan.errors.push({
        rowNumber,
        name: rawName,
        message: "Duplicate name in this file",
      });
      return;
    }
    seenInSheet.add(doc.nameKey);

    // The names travel with the row: the ids for anything new are placeholders
    // until the commit creates the records and resolves them by name.
    const planned: PlannedRawMaterial = { ...doc, categoryName, brandName };

    const existingId = existingIdsByNameKey.get(doc.nameKey);
    if (existingId) plan.updates.push({ ...planned, _id: existingId });
    else plan.creates.push(planned);
  });

  // Only what surviving rows actually referenced — see notePendingUnit's
  // placement. A sheet whose every row failed adds nothing to any list.
  const referenced = [...plan.creates, ...plan.updates];
  const usedCategories = new Set(
    referenced.map((r) => r.categoryName.toLowerCase()),
  );
  const usedBrands = new Set(referenced.map((r) => r.brandName.toLowerCase()));

  plan.newCategories = [...pendingCategories]
    .filter(([key]) => usedCategories.has(key))
    .map(([, name]) => name);
  plan.newBrands = [...pendingBrands]
    .filter(([key]) => usedBrands.has(key))
    .map(([, name]) => name);
  plan.newUnits = [...pendingUnits.values()];

  return plan;
}
