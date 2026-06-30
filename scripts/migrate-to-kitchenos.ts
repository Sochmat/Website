import { Db, MongoClient } from "mongodb";
import { hashPassword } from "../src/lib/password";
import { createIndexes } from "./create-indexes";

// Tenant-scoped collections to copy from source -> target.
const TENANT_COLLECTIONS = [
  "users",
  "orders",
  "menuItems",
  "categories",
  "coupons",
  "subscriptions",
  "mealCards",
  "categoryTiles",
  "bannerSlides",
  "otps",
  "settings",
  "counters",
] as const;

export async function migrate({
  source,
  target,
  env,
}: {
  source: Db;
  target: Db;
  env: Record<string, string | undefined>;
}): Promise<void> {
  // ---------------------------------------------------------------------------
  // 1. Upsert the `sochmat` tenant in target (reuse existing _id if present).
  // ---------------------------------------------------------------------------
  const now = new Date();
  const tenantValues = {
    slug: "sochmat",
    name: "Sochmat",
    legalName: "Sochmat - By Fitfuel",
    status: "active",
    branding: {
      logoUrl: "/logo.svg",
      primaryColor: "#f56215",
      accentColor: "#024731",
    },
    contact: {
      phone: "+91 7042816413",
      email: "",
      address: "Shop-18, Pivotal Paradise,Sector-62,12202, Gurgaon",
    },
    compliance: { gstNo: "06AAGCF8264L1Z6", fssaiNo: "20826005000810" },
    location: {
      lat: 28.40638190515019,
      lng: 77.08898189075938,
      serviceRadiusKm: 10,
    },
    deliveryZones: [
      {
        id: "pivotal-paradise-sector-62",
        name: "Pivotal Paradise",
        sector: "Sector 62",
        towers: ["T1", "T2", "T3", "T4", "T5", "T6", "T7"],
      },
    ],
    integrations: {
      razorpay: null,
      petpooja: null,
      smtp: null,
      printAgentToken: env.PRINT_AGENT_TOKEN ?? "",
    },
    updatedAt: now,
  };

  const existing = await target.collection("tenants").findOne({ slug: "sochmat" });
  if (existing) {
    await target
      .collection("tenants")
      .updateOne({ _id: existing._id }, { $set: tenantValues });
  } else {
    await target
      .collection("tenants")
      .insertOne({ ...tenantValues, createdAt: now });
  }
  const tenant = await target.collection("tenants").findOne({ slug: "sochmat" });
  const tenantId = String(tenant!._id);

  // ---------------------------------------------------------------------------
  // 1b. Pre-flight duplicate check: fail early if source data would violate
  //     unique indexes, giving the operator a chance to clean source first.
  // ---------------------------------------------------------------------------
  await preflightDupCheck(source);

  // ---------------------------------------------------------------------------
  // 2. Copy tenant-scoped collections from source -> target (idempotent).
  //    NEVER write to source.
  // ---------------------------------------------------------------------------
  for (const c of TENANT_COLLECTIONS) {
    const docs = await source.collection(c).find({}).toArray();
    if (docs.length === 0) continue; // nothing in source -> skip

    if (c === "counters") {
      // Re-key counters: "<id>" -> "<tenantId>:<id>". Idempotency: skip if any
      // target counter already prefixed with "<tenantId>:" exists.
      const already = await target
        .collection("counters")
        .countDocuments({ _id: { $regex: `^${escapeRegex(tenantId)}:` } as never });
      if (already > 0) continue;
      const rekeyed = docs.map((d) => ({
        ...d,
        _id: `${tenantId}:${String(d._id)}` as never,
        seq: d.seq,
        tenantId,
      }));
      await target.collection("counters").insertMany(rekeyed);
      continue;
    }

    // Idempotency: skip if target already has docs for this tenant.
    const already = await target.collection(c).countDocuments({ tenantId });
    if (already > 0) continue;

    const stamped = docs.map((d) => ({ ...d, tenantId }));
    await target.collection(c).insertMany(stamped);
  }

  // ---------------------------------------------------------------------------
  // 3. Seed adminUsers in target (idempotent upserts by unique key).
  // ---------------------------------------------------------------------------
  await target.collection("adminUsers").updateOne(
    { tenantId, email: env.ADMIN_USER },
    {
      $set: {
        role: "kitchen-admin",
        name: "Sochmat Admin",
        passwordHash: await hashPassword(env.ADMIN_PASSWORD ?? ""),
      },
      $setOnInsert: { tenantId, email: env.ADMIN_USER },
    },
    { upsert: true },
  );

  await target.collection("adminUsers").updateOne(
    { tenantId, email: env.SHOP_USER },
    {
      $set: {
        role: "shop",
        name: "Sochmat Shop",
        passwordHash: await hashPassword(env.SHOP_PASSWORD ?? ""),
      },
      $setOnInsert: { tenantId, email: env.SHOP_USER },
    },
    { upsert: true },
  );

  await target.collection("adminUsers").updateOne(
    { email: env.SUPERADMIN_EMAIL, role: "superadmin" },
    {
      $set: {
        name: "Super Admin",
        passwordHash: await hashPassword(env.SUPERADMIN_PASSWORD ?? ""),
      },
      $setOnInsert: {
        tenantId: null,
        email: env.SUPERADMIN_EMAIL,
        role: "superadmin",
      },
    },
    { upsert: true },
  );

  // ---------------------------------------------------------------------------
  // 4. Indexes.
  // ---------------------------------------------------------------------------
  await createIndexes(target);
}

/**
 * Pre-flight check: scan the source database for duplicates that would violate
 * the unique indexes in the target (phone in users, orderNumber in orders, code
 * in coupons). Throws with a descriptive error listing offending values so the
 * operator can clean the source before running a cutover.
 */
export async function preflightDupCheck(source: Db): Promise<void> {
  const errors: string[] = [];

  // Duplicate non-empty phone in users. Empty string "" is the no-phone sentinel
  // (used by Google/email users) and must not be flagged as a duplicate.
  // Mirrors the index predicate: phone > "" means only real phones are unique.
  const dupPhones = await source
    .collection("users")
    .aggregate([
      { $match: { phone: { $type: "string", $ne: "" } } },
      { $group: { _id: "$phone", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
  if (dupPhones.length > 0) {
    errors.push(
      `users: duplicate non-null phone values: ${dupPhones.map((d) => d._id).join(", ")}`
    );
  }

  // Duplicate orderNumber in orders.
  const dupOrders = await source
    .collection("orders")
    .aggregate([
      { $match: { orderNumber: { $exists: true } } },
      { $group: { _id: "$orderNumber", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
  if (dupOrders.length > 0) {
    errors.push(
      `orders: duplicate orderNumber values: ${dupOrders.map((d) => d._id).join(", ")}`
    );
  }

  // Duplicate coupon code in coupons.
  const dupCoupons = await source
    .collection("coupons")
    .aggregate([
      { $match: { code: { $exists: true } } },
      { $group: { _id: "$code", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
  if (dupCoupons.length > 0) {
    errors.push(
      `coupons: duplicate code values: ${dupCoupons.map((d) => d._id).join(", ")}`
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Pre-flight duplicate check failed — deduplicate source before cutover:\n  ${errors.join("\n  ")}`
    );
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// -----------------------------------------------------------------------------
// Standalone runner. NEVER writes to source.
// -----------------------------------------------------------------------------
if (process.argv[1]?.endsWith("migrate-to-kitchenos.ts")) {
  (async () => {
    const client = await MongoClient.connect(process.env.MONGODB_URI!);
    try {
      const source = client.db("Sochmat");
      const target = client.db(process.env.MONGODB_DB || "kitchenos");
      await migrate({ source, target, env: process.env });
      console.log(
        `migration complete: sochmat tenant + ${TENANT_COLLECTIONS.length} scoped collections processed, adminUsers seeded, indexes created`,
      );
    } finally {
      await client.close();
    }
  })();
}
