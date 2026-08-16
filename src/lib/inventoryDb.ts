// Shared Mongo access for the inventory console.
//
// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*. Mirrors /api/admin/*: fetch-based CRUD, no server actions,
// no validation library.

import {
  ObjectId,
  type AnyBulkWriteOperation,
  type Db,
  type Document,
} from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CONSUMPTION_UNITS,
  DEFAULT_PURCHASE_UNITS,
  pricePerConsumptionUnit,
  type InventoryUnit,
  type RawMaterial,
  type RawMaterialBrand,
  type RawMaterialCategory,
  type UnitKind,
} from "@/lib/rawMaterials";
import { buildConsumptionLine, type AuditLine } from "@/lib/stockAudits";
import {
  computeCost,
  toRecipeLines,
  type CostingMaterial,
  type ProductionItem,
  type ProductionRecipeLine,
} from "@/lib/productionItems";
import {
  componentKey,
  computeItemRecipeCost,
  itemRecipeCostsById,
  toItemRecipeLines,
  toPackagingLines,
  type ComponentType,
  type ItemRecipe,
  type ItemRecipeGraph,
  type ItemRecipeLine,
} from "@/lib/itemRecipes";
import { recipeLookupKey } from "@/lib/menuRecipes";

export const CATEGORIES_COLLECTION = "inventoryCategories";
export const BRANDS_COLLECTION = "inventoryBrands";
/** Unit names offered for purchase and consumption units — see listUnits. */
export const UNITS_COLLECTION = "inventoryUnits";
export const RAW_MATERIALS_COLLECTION = "inventoryRawMaterials";
export const PRODUCTION_ITEMS_COLLECTION = "inventoryProductionItems";
export const ITEM_RECIPES_COLLECTION = "inventoryItemRecipes";
/** Selling prices per channel, keyed by item nameKey — see priceComparison.ts. */
export const ITEM_PRICES_COLLECTION = "inventoryItemPrices";
/** One document per Audit-screen save — see src/lib/stockAudits.ts. */
export const STOCK_AUDITS_COLLECTION = "inventoryStockAudits";
/** One document per wastage recorded — see src/lib/wastage.ts. */
export const WASTAGES_COLLECTION = "inventoryWastages";

/**
 * Categories, seeding the default set the first time the collection is empty.
 *
 * Seeding on read (rather than via a migration) keeps a fresh environment
 * usable immediately. The insert is ordered:false so a concurrent seeder
 * racing us loses only the duplicates, not the whole batch.
 */
export async function listCategories(): Promise<RawMaterialCategory[]> {
  const { db } = await connectToDatabase();
  const col = db.collection(CATEGORIES_COLLECTION);

  if ((await col.countDocuments({}, { limit: 1 })) === 0) {
    try {
      await col.insertMany(
        DEFAULT_CATEGORIES.map((name) => ({ name })),
        { ordered: false },
      );
    } catch {
      // Another request seeded first — harmless, fall through to the read.
    }
  }

  const docs = await col.find({}).sort({ name: 1 }).toArray();
  return docs.map((d) => ({ _id: String(d._id), name: String(d.name) }));
}

/**
 * Unit names offered for a material's purchase and consumption units.
 *
 * Seeded on first read from the sets these dropdowns used to hard-code, for
 * the same reason categories are: a fresh environment should be usable
 * immediately, and an existing one should see exactly what it saw before.
 * Seeding is per kind, so adding the first consumption unit by hand does not
 * suppress the purchase defaults.
 */
export async function listUnits(kind?: UnitKind): Promise<InventoryUnit[]> {
  const { db } = await connectToDatabase();
  const col = db.collection(UNITS_COLLECTION);

  const defaults: Record<UnitKind, readonly string[]> = {
    consumption: DEFAULT_CONSUMPTION_UNITS,
    purchase: DEFAULT_PURCHASE_UNITS,
  };

  for (const seedKind of ["consumption", "purchase"] as UnitKind[]) {
    if (kind && kind !== seedKind) continue;
    if ((await col.countDocuments({ kind: seedKind }, { limit: 1 })) > 0) {
      continue;
    }
    try {
      await col.insertMany(
        defaults[seedKind].map((name) => ({ name, kind: seedKind })),
        { ordered: false },
      );
    } catch {
      // Another request seeded first — harmless, fall through to the read.
    }
  }

  const docs = await col
    .find(kind ? { kind } : {})
    .sort({ name: 1 })
    .toArray();

  return docs.map((d) => ({
    _id: String(d._id),
    name: String(d.name ?? ""),
    kind: d.kind === "purchase" ? "purchase" : "consumption",
  }));
}

/**
 * Brands. Unlike categories these are never seeded — an empty brand list is a
 * legitimate state, since brand is optional on a material.
 */
export async function listBrands(): Promise<RawMaterialBrand[]> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(BRANDS_COLLECTION)
    .find({})
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => ({ _id: String(d._id), name: String(d.name) }));
}

/** Distinct, non-blank, trimmed — one entry per name however it was cased. */
function distinctNames(names: readonly string[]): string[] {
  const byLower = new Map<string, string>();
  for (const raw of names) {
    const name = String(raw ?? "")
      .replace(/\s+/g, " ")
      .trim();
    if (name && !byLower.has(name.toLowerCase())) {
      byLower.set(name.toLowerCase(), name);
    }
  }
  return [...byLower.values()];
}

/**
 * Create any of `names` that a lookup collection does not already hold, and
 * return the whole list keyed by lowercased name.
 *
 * Used by the spreadsheet importer, where a category or brand the sheet
 * introduces is added rather than failing the row. Matching is
 * case-insensitive, so a sheet saying "dairy" reuses the stored "Dairy"
 * instead of creating a near-duplicate.
 *
 * The insert is ordered:false and the map is re-read afterwards, so a
 * concurrent import racing us loses only its duplicates and still sees the
 * winner's ids.
 */
async function ensureLookups(
  collectionName: string,
  names: readonly string[],
  read: () => Promise<{ _id?: string; name: string }[]>,
): Promise<EnsuredLookups> {
  const existing = await read();
  const byLower = new Map(
    existing.map((e) => [e.name.toLowerCase(), String(e._id)]),
  );

  const missing = distinctNames(names).filter(
    (name) => !byLower.has(name.toLowerCase()),
  );
  if (missing.length === 0) return { ids: byLower, added: [] };

  const { db } = await connectToDatabase();
  try {
    await db
      .collection(collectionName)
      .insertMany(missing.map((name) => ({ name })), { ordered: false });
  } catch {
    // Someone else created the same name first — the re-read below picks up
    // whichever record won.
  }

  const after = await read();
  return {
    ids: new Map(after.map((e) => [e.name.toLowerCase(), String(e._id)])),
    added: missing,
  };
}

/** Lookup ids keyed by lowercased name, plus what had to be created. */
export interface EnsuredLookups {
  ids: Map<string, string>;
  /** Display names created by this call. Empty when everything existed. */
  added: string[];
}

/** Categories, creating any the importer introduced. */
export function ensureCategories(
  names: readonly string[],
): Promise<EnsuredLookups> {
  return ensureLookups(CATEGORIES_COLLECTION, names, listCategories);
}

/** Brands, creating any the importer introduced. */
export function ensureBrands(
  names: readonly string[],
): Promise<EnsuredLookups> {
  return ensureLookups(BRANDS_COLLECTION, names, listBrands);
}

/**
 * Add any unit names the importer introduced to their kind's list.
 *
 * Unlike categories and brands, a material stores its units by NAME, not by
 * id — so nothing here has to be resolved back onto the row. This exists purely
 * so a unit that arrived in a spreadsheet shows up in the dropdowns afterwards
 * instead of being a value only that one material knows about.
 *
 * Returns how many were added, so the import can report it.
 */
export async function ensureUnits(
  units: readonly { name: string; kind: UnitKind }[],
): Promise<number> {
  if (units.length === 0) return 0;

  const { db } = await connectToDatabase();
  const col = db.collection(UNITS_COLLECTION);
  let added = 0;

  for (const kind of ["consumption", "purchase"] as UnitKind[]) {
    const wanted = distinctNames(
      units.filter((u) => u.kind === kind).map((u) => u.name),
    );
    if (wanted.length === 0) continue;

    // Seeds the defaults on first touch, so an imported unit never lands in an
    // otherwise empty list.
    const existing = await listUnits(kind);
    const have = new Set(existing.map((u) => u.name.toLowerCase()));
    const missing = wanted.filter((name) => !have.has(name.toLowerCase()));
    if (missing.length === 0) continue;

    try {
      await col.insertMany(
        missing.map((name) => ({ name, kind })),
        { ordered: false },
      );
      added += missing.length;
    } catch {
      // A concurrent import added the same unit — harmless.
    }
  }

  return added;
}

/** Valid ObjectId hex string? Guards findOne/updateOne from throwing on junk. */
export function isValidId(id: string): boolean {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

export interface RawMaterialQuery {
  /** Case-insensitive substring match on name. */
  search?: string;
  /** Empty/absent means all categories. */
  categoryId?: string;
  /** Empty/absent means all brands. */
  brandId?: string;
}

/**
 * Raw materials with their category name resolved.
 *
 * Filtering happens in Mongo so the export endpoint and the table agree on
 * what "the current view" means. Search is a regex on the stored name; the
 * input is escaped so a user typing "(" doesn't produce an invalid pattern.
 */
export async function listRawMaterials(
  query: RawMaterialQuery = {},
): Promise<RawMaterial[]> {
  const { db } = await connectToDatabase();

  const filter: Record<string, unknown> = {};
  const search = (query.search ?? "").trim();
  if (search) {
    filter.name = { $regex: escapeRegExp(search), $options: "i" };
  }
  if (query.categoryId && isValidId(query.categoryId)) {
    filter.categoryId = query.categoryId;
  }
  if (query.brandId && isValidId(query.brandId)) {
    filter.brandId = query.brandId;
  }

  const [docs, categories, brands] = await Promise.all([
    db
      .collection(RAW_MATERIALS_COLLECTION)
      .find(filter)
      .sort({ name: 1 })
      .toArray(),
    listCategories(),
    listBrands(),
  ]);

  const nameById = new Map(categories.map((c) => [String(c._id), c.name]));
  const brandNameById = new Map(brands.map((b) => [String(b._id), b.name]));

  return docs.map((d) => ({
    _id: String(d._id),
    name: String(d.name ?? ""),
    nameKey: String(d.nameKey ?? ""),
    categoryId: String(d.categoryId ?? ""),
    // Blank rather than a stale label if the category was deleted.
    categoryName: nameById.get(String(d.categoryId ?? "")) ?? "",
    brandId: String(d.brandId ?? ""),
    brandName: brandNameById.get(String(d.brandId ?? "")) ?? "",
    consumptionUnit: String(d.consumptionUnit ?? ""),
    purchaseUnit: String(d.purchaseUnit ?? ""),
    unitConversion: Number(d.unitConversion ?? 0),
    pricePerPurchaseUnit: Number(d.pricePerPurchaseUnit ?? 0),
    alertQty: Number(d.alertQty ?? 0),
    // Only surface stock when it is genuinely tracked — see isLowStock.
    ...(typeof d.currentStock === "number"
      ? { currentStock: d.currentStock }
      : {}),
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
  }));
}

/** Mongo has no regex-quote; escape everything special before interpolating. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** nameKey -> _id for any collection that stores one. */
async function idsByNameKey(collection: string): Promise<Map<string, string>> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(collection)
    .find({}, { projection: { nameKey: 1 } })
    .toArray();
  return new Map(docs.map((d) => [String(d.nameKey ?? ""), String(d._id)]));
}

/** nameKey -> _id, for reconciling a spreadsheet against what exists. */
export function existingIdsByNameKey(): Promise<Map<string, string>> {
  return idsByNameKey(RAW_MATERIALS_COLLECTION);
}

/**
 * The three name -> id lookups the recipe importers need.
 *
 * All three key on nameKey (normalizeMaterialName), the same key the writers
 * store, so a sheet saying "toor  dal." resolves to the record stored as
 * "Toor Dal" instead of failing as unknown.
 */
export const rawMaterialIdsByNameKey = existingIdsByNameKey;

export function productionItemIdsByNameKey(): Promise<Map<string, string>> {
  return idsByNameKey(PRODUCTION_ITEMS_COLLECTION);
}

/**
 * Item recipe ids, keyed the way one is looked up — name, plus variant where
 * there is one.
 *
 * Not the plain nameKey helper the other two collections use: two sizes of one
 * dish share a name, so keying on that alone would let an import overwrite the
 * Large with the Small.
 */
export async function itemRecipeIdsByNameKey(): Promise<Map<string, string>> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(ITEM_RECIPES_COLLECTION)
    .find({}, { projection: { nameKey: 1, variantKey: 1 } })
    .toArray();

  return new Map(
    docs.map((d) => [
      recipeLookupKey(String(d.nameKey ?? ""), String(d.variantKey ?? "")),
      String(d._id),
    ]),
  );
}

/** id -> display name for every raw material, for writing recipe sheets. */
export async function rawMaterialNamesById(): Promise<Map<string, string>> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(RAW_MATERIALS_COLLECTION)
    .find({}, { projection: { name: 1 } })
    .toArray();
  return new Map(docs.map((d) => [String(d._id), String(d.name ?? "")]));
}

/**
 * Display name for everything an item recipe may reference, keyed by the same
 * composite `type:id` its lines use.
 *
 * Item recipes are in here too, because one may now name another: without them
 * an export would write a blank Component cell, and a blank cell reads back as
 * something else entirely.
 */
export async function componentNamesByKey(): Promise<Map<string, string>> {
  const [materials, productionItems, itemRecipes] = await Promise.all([
    rawMaterialNamesById(),
    listProductionItems(),
    listItemRecipes(),
  ]);

  const combined = new Map<string, string>();
  for (const [id, name] of materials) {
    combined.set(componentKey("raw", id), name);
  }
  for (const item of productionItems) {
    combined.set(componentKey("production", String(item._id)), item.name);
  }
  for (const recipe of itemRecipes) {
    combined.set(componentKey("item", String(recipe._id)), recipe.name);
  }
  return combined;
}

/** Name-keyed lookup used by the importer, lowercased for tolerant matching. */
export async function categoryIdsByName(): Promise<Map<string, string>> {
  const categories = await listCategories();
  return new Map(
    categories.map((c) => [c.name.toLowerCase(), String(c._id)]),
  );
}

/** As categoryIdsByName, for the optional Brand column. */
export async function brandIdsByName(): Promise<Map<string, string>> {
  const brands = await listBrands();
  return new Map(brands.map((b) => [b.name.toLowerCase(), String(b._id)]));
}

/** Costing inputs for every raw material, keyed by id. */
export async function costingMaterialsById(): Promise<
  Map<string, CostingMaterial>
> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(RAW_MATERIALS_COLLECTION)
    .find({}, { projection: { pricePerPurchaseUnit: 1, unitConversion: 1 } })
    .toArray();
  return new Map(
    docs.map((d) => [
      String(d._id),
      {
        pricePerPurchaseUnit: Number(d.pricePerPurchaseUnit ?? 0),
        unitConversion: Number(d.unitConversion ?? 0),
      },
    ]),
  );
}

/** Production items, newest field values, optionally name-filtered. */
export async function listProductionItems(
  search?: string,
): Promise<ProductionItem[]> {
  const { db } = await connectToDatabase();
  const filter: Record<string, unknown> = {};
  const term = (search ?? "").trim();
  if (term) filter.name = { $regex: escapeRegExp(term), $options: "i" };

  const docs = await db
    .collection(PRODUCTION_ITEMS_COLLECTION)
    .find(filter)
    .sort({ name: 1 })
    .toArray();

  return docs.map((d) => ({
    _id: String(d._id),
    name: String(d.name ?? ""),
    nameKey: String(d.nameKey ?? ""),
    consumptionUnit: String(d.consumptionUnit ?? ""),
    purchaseUnit: String(d.purchaseUnit ?? ""),
    unitConversion: Number(d.unitConversion ?? 0),
    batchYieldQty: Number(d.batchYieldQty ?? 0),
    // Normalized on read, so a recipe stored before components could be
    // production items still reads as the raw-material lines it always was.
    recipe: toRecipeLines(d.recipe),
    pricePerPurchaseUnit: Number(d.pricePerPurchaseUnit ?? 0),
    alertQty: Number(d.alertQty ?? 0),
    // Absent on everything written before the flag existed, which is exactly
    // what "kept prepared in advance" was and still is — see the field's doc.
    onSpot: d.onSpot === true,
    // Only surface stock when it is genuinely tracked — see isBelowAlert.
    ...(typeof d.currentStock === "number"
      ? { currentStock: d.currentStock }
      : {}),
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
  }));
}

/**
 * Every production item's recipe, keyed by id — the graph a nested recipe is
 * checked against for loops. See sanitizeProductionItem's `graph` argument.
 */
export async function productionRecipesById(): Promise<
  Map<string, ProductionRecipeLine[]>
> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(PRODUCTION_ITEMS_COLLECTION)
    .find({}, { projection: { recipe: 1 } })
    .toArray();
  return new Map(docs.map((d) => [String(d._id), toRecipeLines(d.recipe)]));
}

/**
 * Which production items each stored item is made from, by nameKey.
 *
 * The importer's view of the same graph productionRecipesById serves the form:
 * a spreadsheet matches on name, and its new items have no id yet, so the loop
 * check there has to run on names.
 */
export async function productionDepsByNameKey(): Promise<
  Map<string, string[]>
> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(PRODUCTION_ITEMS_COLLECTION)
    .find({}, { projection: { nameKey: 1, recipe: 1 } })
    .toArray();

  const nameKeyById = new Map(
    docs.map((d) => [String(d._id), String(d.nameKey ?? "")]),
  );

  return new Map(
    docs.map((d) => [
      String(d.nameKey ?? ""),
      toRecipeLines(d.recipe)
        .filter((line) => line.refType === "production")
        // A line pointing at a deleted item names nothing that could close a
        // loop, so it drops out rather than becoming a blank node.
        .map((line) => nameKeyById.get(line.refId) ?? "")
        .filter(Boolean),
    ]),
  );
}

/**
 * Match recipe lines pointing at one component, in either stored shape.
 *
 * Recipes written before they could name production items carry
 * `rawMaterialId` and no type; current ones carry `refType`/`refId`. A guard
 * that only knew one shape would let a still-referenced record be deleted.
 */
function recipeUsesFilter(
  refType: ComponentType,
  refId: string,
): Record<string, unknown> {
  const current = { recipe: { $elemMatch: { refType, refId } } };
  // Only raw materials were ever stored the old way.
  return refType === "raw"
    ? { $or: [current, { "recipe.rawMaterialId": refId }] }
    : current;
}

/** How many production items use a given component in their recipe. */
export async function productionItemsUsing(
  refId: string,
  refType: ComponentType = "raw",
): Promise<number> {
  const { db } = await connectToDatabase();
  return db
    .collection(PRODUCTION_ITEMS_COLLECTION)
    .countDocuments(recipeUsesFilter(refType, refId));
}

/**
 * Re-derive and store every production item's price.
 *
 * A production item's price is a cached derivation of what it is made from, so
 * it goes stale the moment any of those prices moves. Every raw-material write
 * path calls this.
 *
 * Recipes may nest production items, so a single raw-material edit can ripple
 * through an arbitrarily long chain of bases. Rather than tracking which ids
 * that chain reaches, recompute the lot in dependency order — same trade-off
 * recalcItemRecipeCosts makes, and for the same reason: this collection is
 * small, and correctness matters more than shaving a query. Nothing here reads
 * a production item's stored price to cost another one; each is computed from
 * components already settled in this pass.
 *
 * Returns how many items were rewritten, so callers can surface it.
 */
export async function recalcProductionItemPrices(): Promise<number> {
  const { db } = await connectToDatabase();
  const col = db.collection(PRODUCTION_ITEMS_COLLECTION);

  const docs = await col.find({}).toArray();
  if (docs.length === 0) return 0;

  const items = docs.map((doc) => ({
    _id: doc._id,
    id: String(doc._id),
    recipe: toRecipeLines(doc.recipe),
    batchYieldQty: Number(doc.batchYieldQty ?? 0),
    unitConversion: Number(doc.unitConversion ?? 0),
    storedPrice: Number(doc.pricePerPurchaseUnit ?? 0),
  }));

  // Raw material is the floor of the graph — its prices are given, not derived.
  const costs = new Map<string, CostingMaterial>();
  for (const [id, cost] of await costingMaterialsById()) {
    costs.set(componentKey("raw", id), cost);
  }
  // Seed each production item at its stored price, so one that never gets
  // settled (an item inside a loop) still costs what it last cost rather than
  // silently costing nothing.
  for (const item of items) {
    costs.set(componentKey("production", item.id), {
      pricePerPurchaseUnit: item.storedPrice,
      unitConversion: item.unitConversion,
    });
  }

  const byId = new Map(items.map((item) => [item.id, item]));
  const settled = new Set<string>();
  const ops: AnyBulkWriteOperation<Document>[] = [];
  const now = new Date();

  /** Settle everything this item is made from, then the item itself. */
  const settle = (id: string, visiting: Set<string>) => {
    if (settled.has(id)) return;
    const item = byId.get(id);
    if (!item) return;
    // A loop has no dependency order to walk. Saves reject loops, so this only
    // guards data that predates that rule — it must terminate, not resolve.
    if (visiting.has(id)) return;

    visiting.add(id);
    for (const line of item.recipe) {
      if (line.refType === "production") settle(line.refId, visiting);
    }
    visiting.delete(id);

    const { pricePerPurchaseUnit } = computeCost(
      item.recipe,
      item.batchYieldQty,
      item.unitConversion,
      costs,
    );
    costs.set(componentKey("production", id), {
      pricePerPurchaseUnit,
      unitConversion: item.unitConversion,
    });
    settled.add(id);

    // Skip no-op writes so an unrelated raw-material edit doesn't bump
    // updatedAt across the whole table.
    if (pricePerPurchaseUnit !== item.storedPrice) {
      ops.push({
        updateOne: {
          filter: { _id: item._id },
          update: { $set: { pricePerPurchaseUnit, updatedAt: now } },
        },
      });
    }
  };

  for (const item of items) settle(item.id, new Set());

  if (ops.length === 0) return 0;
  await col.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/**
 * Take `owed` off a stock-carrying collection, and report what that did.
 *
 * Shared by everything that spends stock: producing a batch draws down its raw
 * material, delivering an order draws down whatever its recipes name. Both
 * kinds of row carry the same fields, so one function covers either collection.
 *
 * The quantity may go negative — see buildConsumptionLine. Because nothing is
 * clamped, the write is a plain $inc: it settles on the server, so a delivery
 * landing at the same moment adds to this draw-down instead of racing it. The
 * documents are still read first, for the history line's "before" side and to
 * find out which ids still exist.
 *
 * The returned lines carry the quantity computed from that read. A concurrent
 * write in between makes the stored figure differ from the reported one, but
 * never wrong: $inc applies both movements.
 *
 * Ids that no longer exist are skipped: a recipe pointing at a deleted item
 * has nothing to spend.
 */
export async function drawDownStock(
  db: Db,
  collectionName: string,
  owed: ReadonlyMap<string, number>,
  now: Date,
): Promise<AuditLine[]> {
  const ids = [...owed.keys()].filter(isValidId);
  if (ids.length === 0) return [];

  const collection = db.collection(collectionName);
  const docs = await collection
    .find(
      { _id: { $in: ids.map((id) => new ObjectId(id)) } },
      {
        projection: {
          name: 1,
          consumptionUnit: 1,
          currentStock: 1,
          pricePerPurchaseUnit: 1,
          unitConversion: 1,
        },
      },
    )
    .toArray();

  const lines = docs.map((doc) =>
    buildConsumptionLine({
      id: String(doc._id),
      name: String(doc.name ?? ""),
      unit: String(doc.consumptionUnit ?? ""),
      previousStock:
        typeof doc.currentStock === "number" ? doc.currentStock : null,
      consumedQty: owed.get(String(doc._id)) ?? 0,
      // Priced here, at save time — see AuditLine.unitCost.
      unitCost: pricePerConsumptionUnit({
        pricePerPurchaseUnit: Number(doc.pricePerPurchaseUnit ?? 0),
        unitConversion: Number(doc.unitConversion ?? 0),
      }),
    }),
  );

  if (lines.length > 0) {
    await collection.bulkWrite(
      lines.map((line) => ({
        updateOne: {
          filter: { _id: new ObjectId(line.id) },
          // An absent currentStock starts the field at the negative amount,
          // which is what "spending stock nobody had counted" leaves behind.
          update: {
            $inc: { currentStock: -(line.consumedQty as number) },
            $set: { updatedAt: now },
          },
        },
      })),
      { ordered: false },
    );
  }

  return lines;
}

/** Item recipes, optionally name-filtered. */
export async function listItemRecipes(search?: string): Promise<ItemRecipe[]> {
  const { db } = await connectToDatabase();
  const filter: Record<string, unknown> = {};
  const term = (search ?? "").trim();
  if (term) filter.name = { $regex: escapeRegExp(term), $options: "i" };

  const docs = await db
    .collection(ITEM_RECIPES_COLLECTION)
    .find(filter)
    .sort({ name: 1 })
    .toArray();

  return docs.map((d) => ({
    _id: String(d._id),
    name: String(d.name ?? ""),
    nameKey: String(d.nameKey ?? ""),
    // Absent on every recipe written before variants — which is exactly what
    // "this is the item's base recipe" means.
    variantName: d.variantName ? String(d.variantName) : undefined,
    variantKey: d.variantKey ? String(d.variantKey) : undefined,
    lines: toItemRecipeLines(d.lines),
    totalCost: Number(d.totalCost ?? 0),
    packagingLines: toPackagingLines(d.packagingLines),
    packagingCost: Number(d.packagingCost ?? 0),
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
  }));
}

/**
 * What sanitizeItemRecipe needs to resolve an `item` line: every stored
 * recipe's components, and every stored recipe's settled cost.
 *
 * A search filter must NOT be applied here — the loop check has to see recipes
 * the user is not currently looking at, or a chain could be closed through one
 * that happens to be filtered out of the table.
 */
export async function itemRecipeGraph(
  selfId?: string,
): Promise<ItemRecipeGraph> {
  const [recipes, components] = await Promise.all([
    listItemRecipes(),
    componentCostsByKey(),
  ]);

  const linesById = new Map<string, ItemRecipeLine[]>(
    recipes.map((r) => [String(r._id), r.lines]),
  );
  return {
    linesById,
    costsById: itemRecipeCostsById(recipes, components),
    selfId,
  };
}

/**
 * Which item recipes each stored recipe is built on, by nameKey.
 *
 * The importer's view of the graph itemRecipeGraph serves the form — a
 * spreadsheet matches on name, so its loop check has to run on names. Mirrors
 * productionDepsByNameKey one level up.
 */
export async function itemRecipeDepsByNameKey(): Promise<
  Map<string, string[]>
> {
  const { db } = await connectToDatabase();
  const docs = await db
    .collection(ITEM_RECIPES_COLLECTION)
    .find({}, { projection: { nameKey: 1, variantKey: 1, lines: 1 } })
    .toArray();

  // Keyed the way the importer groups rows — name plus variant — so the loop
  // check compares like with like.
  const nameKeyById = new Map(
    docs.map((d) => [
      String(d._id),
      recipeLookupKey(String(d.nameKey ?? ""), String(d.variantKey ?? "")),
    ]),
  );

  return new Map(
    docs.map((d) => [
      recipeLookupKey(String(d.nameKey ?? ""), String(d.variantKey ?? "")),
      toItemRecipeLines(d.lines)
        .filter((line) => line.refType === "item")
        // A line pointing at a deleted recipe names nothing that could close a
        // loop, so it drops out rather than becoming a blank node.
        .map((line) => nameKeyById.get(line.refId) ?? "")
        .filter(Boolean),
    ]),
  );
}

/**
 * Costing inputs for everything an item recipe may reference — raw materials
 * and production items together, keyed by composite `type:id`.
 */
export async function componentCostsByKey(): Promise<
  Map<string, CostingMaterial>
> {
  const [materials, productionItems] = await Promise.all([
    costingMaterialsById(),
    listProductionItems(),
  ]);

  const combined = new Map<string, CostingMaterial>();
  for (const [id, cost] of materials) {
    combined.set(componentKey("raw", id), cost);
  }
  for (const item of productionItems) {
    combined.set(componentKey("production", String(item._id)), {
      pricePerPurchaseUnit: item.pricePerPurchaseUnit,
      unitConversion: item.unitConversion,
    });
  }
  return combined;
}

/**
 * How many item recipes reference a given component, as a component or as
 * packaging.
 *
 * Packaging counts because it is consumed just as a component is — a raw
 * material nothing cooks with but every takeaway box needs is still in use,
 * and deleting it would leave those recipes deducting nothing for it.
 */
export async function itemRecipesUsing(
  refType: ComponentType,
  refId: string,
): Promise<number> {
  const { db } = await connectToDatabase();
  return db.collection(ITEM_RECIPES_COLLECTION).countDocuments({
    $or: [
      { lines: { $elemMatch: { refType, refId } } },
      { packagingLines: { $elemMatch: { refType, refId } } },
    ],
  });
}

/**
 * Re-derive and store every item recipe's total cost.
 *
 * Item-recipe cost depends on raw materials AND production items, and a
 * production item's own price depends on raw materials — so a single
 * raw-material edit can ripple two levels. A recipe built on another recipe
 * adds a third. Rather than tracking which ids moved through that chain,
 * recompute the lot: this collection is small, and correctness matters more
 * than shaving a query. Callers must run this AFTER recalcProductionItemPrices
 * so the middle layer is already settled.
 *
 * itemRecipeCostsById settles nested recipes depth first, so a combo is never
 * priced from a stale copy of the plate inside it, whatever order the
 * collection comes back in.
 *
 * Returns how many recipes changed.
 */
export async function recalcItemRecipeCosts(): Promise<number> {
  const { db } = await connectToDatabase();
  const col = db.collection(ITEM_RECIPES_COLLECTION);

  const recipes = await listItemRecipes();
  if (recipes.length === 0) return 0;

  const components = await componentCostsByKey();
  const costs = itemRecipeCostsById(recipes, components);
  const now = new Date();

  const ops = recipes.flatMap((recipe) => {
    const totalCost = costs.get(String(recipe._id)) ?? 0;
    // Packaging is raw materials only, so it settles in one pass off the same
    // component prices — no nesting to walk, unlike the food cost above.
    const packagingCost = computeItemRecipeCost(
      recipe.packagingLines ?? [],
      components,
    ).totalCost;

    if (
      totalCost === recipe.totalCost &&
      packagingCost === (recipe.packagingCost ?? 0)
    ) {
      return [];
    }
    return [
      {
        updateOne: {
          filter: { _id: new ObjectId(recipe._id) },
          update: { $set: { totalCost, packagingCost, updatedAt: now } },
        },
      },
    ];
  });

  if (ops.length === 0) return 0;
  await col.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/**
 * Settle every derived price after a raw-material change: production items
 * first, then the item recipes that may reference them.
 */
export async function recalcDerivedCosts(): Promise<{
  productionItems: number;
  itemRecipes: number;
}> {
  const productionItems = await recalcProductionItemPrices();
  const itemRecipes = await recalcItemRecipeCosts();
  return { productionItems, itemRecipes };
}
