import { Db, MongoClient } from "mongodb";

export async function createIndexes(db: Db): Promise<void> {
  await db.collection("tenants").createIndex({ slug: 1 }, { unique: true });
  await db.collection("adminUsers").createIndex({ tenantId: 1, email: 1 }, { unique: true });
  await db.collection("orders").createIndex({ tenantId: 1, orderNumber: 1 }, { unique: true });
  await db.collection("orders").createIndex({ tenantId: 1, status: 1, kotPrinted: 1 });
  await db.collection("users").createIndex({ tenantId: 1, phone: 1 }, { unique: true });
  await db.collection("coupons").createIndex({ tenantId: 1, code: 1 }, { unique: true });
  await db.collection("menuItems").createIndex({ tenantId: 1, category: 1 });
  for (const c of ["categories", "subscriptions", "mealCards", "categoryTiles", "bannerSlides", "settings"])
    await db.collection(c).createIndex({ tenantId: 1 });
  await db.collection("settings").createIndex({ tenantId: 1, key: 1 }, { unique: true });
}

if (process.argv[1]?.endsWith("create-indexes.ts")) {
  (async () => {
    const client = await MongoClient.connect(process.env.MONGODB_URI!);
    await createIndexes(client.db(process.env.MONGODB_DB || "kitchenos"));
    await client.close();
    console.log("indexes created");
  })();
}
