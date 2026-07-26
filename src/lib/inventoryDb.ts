// Shared Mongo access for the inventory console.
//
// Admin-only; enforced by the admin session check in src/middleware.ts for
// /api/inventory/*. Mirrors /api/admin/*: fetch-based CRUD, no server actions,
// no validation library.

import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  DEFAULT_CATEGORIES,
  type RawMaterial,
  type RawMaterialBrand,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";
import {
  computeCost,
  type CostingMaterial,
  type ProductionItem,
  type ProductionRecipeLine,
} from "@/lib/productionItems";
import {
  componentKey,
  computeItemRecipeCost,
  type ComponentType,
  type ItemRecipe,
  type ItemRecipeLine,
} from "@/lib/itemRecipes";

export const CATEGORIES_COLLECTION = "inventoryCategories";
export const BRANDS_COLLECTION = "inventoryBrands";
export const RAW_MATERIALS_COLLECTION = "inventoryRawMaterials";
export const PRODUCTION_ITEMS_COLLECTION = "inventoryProductionItems";
export const ITEM_RECIPES_COLLECTION = "inventoryItemRecipes";

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

export function itemRecipeIdsByNameKey(): Promise<Map<string, string>> {
  return idsByNameKey(ITEM_RECIPES_COLLECTION);
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
 */
export async function componentNamesByKey(): Promise<Map<string, string>> {
  const [materials, productionItems] = await Promise.all([
    rawMaterialNamesById(),
    listProductionItems(),
  ]);

  const combined = new Map<string, string>();
  for (const [id, name] of materials) {
    combined.set(componentKey("raw", id), name);
  }
  for (const item of productionItems) {
    combined.set(componentKey("production", String(item._id)), item.name);
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
    recipe: Array.isArray(d.recipe)
      ? d.recipe.map((line: { rawMaterialId?: unknown; qtyUsed?: unknown }) => ({
          rawMaterialId: String(line?.rawMaterialId ?? ""),
          qtyUsed: Number(line?.qtyUsed ?? 0),
        }))
      : [],
    pricePerPurchaseUnit: Number(d.pricePerPurchaseUnit ?? 0),
    alertQty: Number(d.alertQty ?? 0),
    // Only surface stock when it is genuinely tracked — see isBelowAlert.
    ...(typeof d.currentStock === "number"
      ? { currentStock: d.currentStock }
      : {}),
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
  }));
}

/** How many production items use a given raw material in their recipe. */
export async function productionItemsUsing(
  rawMaterialId: string,
): Promise<number> {
  const { db } = await connectToDatabase();
  return db
    .collection(PRODUCTION_ITEMS_COLLECTION)
    .countDocuments({ "recipe.rawMaterialId": rawMaterialId });
}

/**
 * Re-derive and store the price of every production item whose recipe uses any
 * of `rawMaterialIds`.
 *
 * A production item's price is a cached derivation of raw-material prices, so
 * it goes stale the moment one of those prices moves. Every raw-material write
 * path calls this. Passing no ids recalculates everything, which is what a
 * bulk import wants.
 *
 * Returns how many items were rewritten, so callers can surface it.
 */
export async function recalcProductionItemPrices(
  rawMaterialIds?: string[],
): Promise<number> {
  const { db } = await connectToDatabase();
  const col = db.collection(PRODUCTION_ITEMS_COLLECTION);

  const filter =
    rawMaterialIds && rawMaterialIds.length > 0
      ? { "recipe.rawMaterialId": { $in: rawMaterialIds } }
      : {};

  const affected = await col.find(filter).toArray();
  if (affected.length === 0) return 0;

  const materials = await costingMaterialsById();
  const now = new Date();

  const ops = affected.flatMap((doc) => {
    const recipe: ProductionRecipeLine[] = Array.isArray(doc.recipe)
      ? doc.recipe.map((l: { rawMaterialId?: unknown; qtyUsed?: unknown }) => ({
          rawMaterialId: String(l?.rawMaterialId ?? ""),
          qtyUsed: Number(l?.qtyUsed ?? 0),
        }))
      : [];
    const { pricePerPurchaseUnit } = computeCost(
      recipe,
      Number(doc.batchYieldQty ?? 0),
      Number(doc.unitConversion ?? 0),
      materials,
    );
    // Skip no-op writes so an unrelated raw-material edit doesn't bump
    // updatedAt across the whole table.
    if (pricePerPurchaseUnit === Number(doc.pricePerPurchaseUnit ?? 0)) {
      return [];
    }
    return [
      {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { pricePerPurchaseUnit, updatedAt: now } },
        },
      },
    ];
  });

  if (ops.length === 0) return 0;
  await col.bulkWrite(ops, { ordered: false });
  return ops.length;
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
    lines: Array.isArray(d.lines)
      ? d.lines.map(
          (l: { refType?: unknown; refId?: unknown; qtyUsed?: unknown }) => ({
            refType: (l?.refType === "production"
              ? "production"
              : "raw") as ComponentType,
            refId: String(l?.refId ?? ""),
            qtyUsed: Number(l?.qtyUsed ?? 0),
          }),
        )
      : [],
    totalCost: Number(d.totalCost ?? 0),
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : undefined,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : undefined,
  }));
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

/** How many item recipes reference a given component. */
export async function itemRecipesUsing(
  refType: ComponentType,
  refId: string,
): Promise<number> {
  const { db } = await connectToDatabase();
  return db
    .collection(ITEM_RECIPES_COLLECTION)
    .countDocuments({ lines: { $elemMatch: { refType, refId } } });
}

/**
 * Re-derive and store every item recipe's total cost.
 *
 * Item-recipe cost depends on raw materials AND production items, and a
 * production item's own price depends on raw materials — so a single
 * raw-material edit can ripple two levels. Rather than tracking which ids
 * moved through that chain, recompute the lot: this collection is small, and
 * correctness matters more than shaving a query. Callers must run this AFTER
 * recalcProductionItemPrices so the middle layer is already settled.
 *
 * Returns how many recipes changed.
 */
export async function recalcItemRecipeCosts(): Promise<number> {
  const { db } = await connectToDatabase();
  const col = db.collection(ITEM_RECIPES_COLLECTION);

  const recipes = await col.find({}).toArray();
  if (recipes.length === 0) return 0;

  const components = await componentCostsByKey();
  const now = new Date();

  const ops = recipes.flatMap((doc) => {
    const lines: ItemRecipeLine[] = Array.isArray(doc.lines)
      ? doc.lines.map(
          (l: { refType?: unknown; refId?: unknown; qtyUsed?: unknown }) => ({
            refType: (l?.refType === "production"
              ? "production"
              : "raw") as ComponentType,
            refId: String(l?.refId ?? ""),
            qtyUsed: Number(l?.qtyUsed ?? 0),
          }),
        )
      : [];
    const { totalCost } = computeItemRecipeCost(lines, components);
    if (totalCost === Number(doc.totalCost ?? 0)) return [];
    return [
      {
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { totalCost, updatedAt: now } },
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
export async function recalcDerivedCosts(
  rawMaterialIds?: string[],
): Promise<{ productionItems: number; itemRecipes: number }> {
  const productionItems = await recalcProductionItemPrices(rawMaterialIds);
  const itemRecipes = await recalcItemRecipeCosts();
  return { productionItems, itemRecipes };
}
