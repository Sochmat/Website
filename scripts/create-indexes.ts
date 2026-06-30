import { Db, MongoClient } from "mongodb";

export async function createIndexes(db: Db): Promise<void> {
  await db.collection("tenants").createIndex({ slug: 1 }, { unique: true });
  await db.collection("adminUsers").createIndex({ tenantId: 1, email: 1 }, { unique: true });
  // Superadmin partial unique: only one superadmin per email globally.
  await db.collection("adminUsers").createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { role: "superadmin" } }
  );
  await db.collection("orders").createIndex({ tenantId: 1, orderNumber: 1 }, { unique: true });
  await db.collection("orders").createIndex({ tenantId: 1, status: 1, kotPrinted: 1 });
  // Partial unique: only enforce uniqueness when phone is a non-empty string.
  // Google/email users without a phone store phone:"" as a sentinel; multiple
  // phone-less users in the same tenant must not collide, so empty strings are
  // excluded via $gt:"" (any non-empty string is lexicographically > "").
  // Note: $ne is NOT supported in partialFilterExpression; $gt:"" is the
  // supported idiom for excluding empty strings.
  await db.collection("users").createIndex(
    { tenantId: 1, phone: 1 },
    { unique: true, partialFilterExpression: { phone: { $type: "string", $gt: "" } } }
  );
  await db.collection("coupons").createIndex({ tenantId: 1, code: 1 }, { unique: true });
  await db.collection("menuItems").createIndex({ tenantId: 1, category: 1 });
  for (const c of ["categories", "subscriptions", "mealCards", "categoryTiles", "bannerSlides", "settings"])
    await db.collection(c).createIndex({ tenantId: 1 });
  await db.collection("settings").createIndex({ tenantId: 1, key: 1 }, { unique: true });
  // OTP indexes: tenant lookup + TTL expiry.
  // expiresAt is stored as a BSON Date (new Date(...)) so a real TTL index works.
  await db.collection("otps").createIndex({ tenantId: 1 });
  await db.collection("otps").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

if (process.argv[1]?.endsWith("create-indexes.ts")) {
  (async () => {
    const client = await MongoClient.connect(process.env.MONGODB_URI!);
    await createIndexes(client.db(process.env.MONGODB_DB || "kitchenos"));
    await client.close();
    console.log("indexes created");
  })();
}
