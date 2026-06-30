import { Collection } from "mongodb";
import { connectToDatabase } from "./mongodb";

const TENANT_SCOPED = new Set([
  "users", "orders", "menuItems", "categories", "coupons", "subscriptions",
  "mealCards", "categoryTiles", "bannerSlides", "otps", "settings",
]);
// `counters` is scoped via key, not filter — handled in kotCounter. Not exposed here.

export interface ScopedDb {
  raw(coll: string): Collection;
  find(coll: string, filter?: object): ReturnType<Collection["find"]>;
  findOne(coll: string, filter?: object): Promise<any>;
  insertOne(coll: string, doc: object): Promise<any>;
  insertMany(coll: string, docs: object[]): Promise<any>;
  updateOne(coll: string, filter: object, update: object, opts?: object): Promise<any>;
  updateMany(coll: string, filter: object, update: object): Promise<any>;
  deleteOne(coll: string, filter: object): Promise<any>;
  deleteMany(coll: string, filter: object): Promise<any>;
  countDocuments(coll: string, filter?: object): Promise<number>;
}

export async function forTenant(tenantId: string): Promise<ScopedDb> {
  const { db } = await connectToDatabase();
  const guard = (coll: string): Collection => {
    if (!TENANT_SCOPED.has(coll)) throw new Error(`Collection '${coll}' is not tenant-scoped`);
    return db.collection(coll);
  };
  const scope = (filter: object = {}) => ({ ...filter, tenantId });
  const stamp = (doc: object) => ({ ...doc, tenantId });
  return {
    raw: guard,
    find: (c, f) => guard(c).find(scope(f)),
    findOne: (c, f) => guard(c).findOne(scope(f)),
    insertOne: (c, d) => guard(c).insertOne(stamp(d)),
    insertMany: (c, ds) => guard(c).insertMany(ds.map(stamp)),
    updateOne: (c, f, u, o) => guard(c).updateOne(scope(f), u, o),
    updateMany: (c, f, u) => guard(c).updateMany(scope(f), u),
    deleteOne: (c, f) => guard(c).deleteOne(scope(f)),
    deleteMany: (c, f) => guard(c).deleteMany(scope(f)),
    countDocuments: (c, f) => guard(c).countDocuments(scope(f)),
  };
}
