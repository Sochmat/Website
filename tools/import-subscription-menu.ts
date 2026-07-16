/**
 * Import the subscription menu + bracket prices from Subscriptions.xlsx.
 *
 *   npx tsx tools/import-subscription-menu.ts ~/Downloads/Subscriptions.xlsx [--dry-run] [--seed-prices]
 *
 * Idempotent. Items are upserted on (bracket, importKey), where importKey is the
 * normalized name of the *original* spreadsheet row and never changes. That is
 * what lets an admin rename "Chcken loaded omellte" to "Chicken Loaded Omelette"
 * without the next import re-inserting the typo'd row as a duplicate.
 *
 * Admin-owned fields (image, kcal, description, …) are written with $setOnInsert,
 * so a re-run never clobbers a content pass. Bracket prices are $setOnInsert too;
 * pass --seed-prices to deliberately reset them to the spreadsheet's values.
 *
 * This file is the IO half only. All parsing lives in src/lib/subscriptionImport.ts,
 * which is pure and unit-tested.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";

import {
  bracketForSheet,
  parseBracketSheet,
  type Cell,
  type ParsedItem,
} from "../src/lib/subscriptionImport";
import type { ProteinBracketKey } from "../src/lib/types";

// --- env -------------------------------------------------------------------
// Next loads .env.local for the app; a bare tsx process does not.
function loadEnvLocal() {
  for (const file of [".env.local", ".env"]) {
    let raw: string;
    try {
      raw = readFileSync(resolve(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (!m) continue;
      const [, key, value] = m;
      if (process.env[key] === undefined) {
        process.env[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }
}

// --- bracket metadata ------------------------------------------------------
const BRACKET_META: Record<
  ProteinBracketKey,
  { label: string; proteinMin: number; proteinMax: number; sortOrder: number }
> = {
  "25-30": { label: "25-30g protein", proteinMin: 25, proteinMax: 30, sortOrder: 0 },
  "30-40": { label: "30-40g protein", proteinMin: 30, proteinMax: 40, sortOrder: 1 },
  "40-50": { label: "40-50g protein", proteinMin: 40, proteinMax: 50, sortOrder: 2 },
};

// --- xlsx ------------------------------------------------------------------

/** ExcelJS hands back `{ formula, result }` for computed cells; we want the value. */
function cellValue(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "object") {
    const o = v as { result?: unknown; richText?: Array<{ text: string }> };
    if (o.result !== undefined) return cellValue(o.result);
    if (o.richText) return o.richText.map((r) => r.text).join("");
  }
  return null;
}

async function readSheets(path: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const sheets: Array<{ bracket: ProteinBracketKey; name: string; rows: Cell[][] }> = [];
  wb.eachSheet((ws) => {
    const bracket = bracketForSheet(ws.name);
    if (!bracket) return; // the Zomato sheet, and anything else we don't own

    const rows: Cell[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      rows.push([1, 2, 3].map((c) => cellValue(row.getCell(c).value)));
    }
    sheets.push({ bracket, name: ws.name, rows });
  });
  return sheets;
}

// --- main ------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const seedPrices = args.includes("--seed-prices");
  const path = args.find((a) => !a.startsWith("--"));

  if (!path) {
    console.error(
      "usage: npx tsx tools/import-subscription-menu.ts <Subscriptions.xlsx> [--dry-run] [--seed-prices]",
    );
    process.exit(1);
  }

  const sheets = await readSheets(path);
  if (sheets.length !== 3) {
    console.error(`Expected 3 bracket sheets, found ${sheets.length}.`);
    process.exit(1);
  }

  const parsed = sheets.map((s) => ({
    ...s,
    ...parseBracketSheet(s.rows, s.name), // throws loudly on a reshaped sheet
  }));

  let totalItems = 0;
  let totalHidden = 0;
  console.log("");
  for (const s of parsed) {
    const hidden = s.items.filter((i) => i.protein === null).length;
    totalItems += s.items.length;
    totalHidden += hidden;
    console.log(
      `  ${s.name.padEnd(20)} ${String(s.items.length).padStart(2)} items  ` +
        `${String(hidden).padStart(2)} need protein  ` +
        `veg ₹${s.vegPrice}  non-veg ₹${s.nonVegPrice}`,
    );
  }
  console.log(
    `\n  ${totalItems} items · ${totalHidden} hidden · ${parsed.length} brackets\n`,
  );

  if (dryRun) {
    console.log("  --dry-run: nothing written.\n");
    return;
  }

  loadEnvLocal();
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (checked env, .env.local, .env).");
    process.exit(1);
  }

  const { connectToDatabase } = await import("../src/lib/mongodb");
  const { client, db } = await connectToDatabase();

  await ensureIndexes(db);

  const now = new Date();
  const stats = { inserted: 0, updated: 0, unchanged: 0 };

  for (const sheet of parsed) {
    for (const item of sheet.items) {
      const r = await upsertItem(db, sheet.bracket, item, now);
      if (r.upsertedCount) stats.inserted++;
      else if (r.modifiedCount) stats.updated++;
      else stats.unchanged++;
    }

    const meta = BRACKET_META[sheet.bracket];
    const prices = { vegPrice: sheet.vegPrice, nonVegPrice: sheet.nonVegPrice };
    await db.collection("subscriptionBrackets").updateOne(
      { key: sheet.bracket },
      {
        $set: {
          ...meta,
          active: true,
          updatedAt: now,
          // Prices are admin-editable. Only overwrite on an explicit --seed-prices,
          // otherwise a routine re-import would silently revert a price change.
          ...(seedPrices ? prices : {}),
        },
        $setOnInsert: {
          key: sheet.bracket,
          createdAt: now,
          ...(seedPrices ? {} : prices),
        },
      },
      { upsert: true },
    );
  }

  console.log(
    `  items: ${stats.inserted} inserted · ${stats.updated} updated · ${stats.unchanged} unchanged`,
  );
  console.log(
    `  brackets: 3 upserted${seedPrices ? " (prices reset from sheet)" : " (prices preserved)"}\n`,
  );

  await client.close();
}

type Db = Awaited<ReturnType<typeof import("../src/lib/mongodb").connectToDatabase>>["db"];

async function upsertItem(
  db: Db,
  bracket: ProteinBracketKey,
  item: ParsedItem,
  now: Date,
) {
  // Mongo rejects the same path in $set and $setOnInsert, so each optional field
  // lands in exactly one of the two objects.
  const $set: Record<string, unknown> = {
    name: item.name,
    nameKey: item.nameKey,
    bracket,
    isVeg: item.isVeg,
    sortOrder: item.sortOrder,
    source: "sheet",
    updatedAt: now,
  };
  const $setOnInsert: Record<string, unknown> = {
    // An admin who fills in the protein and un-hides the row must survive a re-import.
    hidden: item.protein === null,
    description: "",
    kcal: 0,
    fiber: 0,
    carbs: 0,
    image: "",
    ingredients: [],
    createdAt: now,
  };

  // Never clobber an admin-supplied value with a blank spreadsheet cell.
  if (item.protein !== null) $set.protein = item.protein;
  else $setOnInsert.protein = 0;

  if (item.referencePrice !== null) $set.referencePrice = item.referencePrice;
  else $setOnInsert.referencePrice = 0;

  return db
    .collection("subscriptionMenuItems")
    .updateOne({ bracket, importKey: item.importKey }, { $set, $setOnInsert }, { upsert: true });
}

/** The repo has no migration runner, so the importer owns the subscription indexes. */
async function ensureIndexes(db: Db) {
  await db
    .collection("subscriptionMenuItems")
    .createIndex({ bracket: 1, importKey: 1 }, { unique: true, sparse: true });
  await db.collection("subscriptionMenuItems").createIndex({ bracket: 1, hidden: 1, sortOrder: 1 });
  await db.collection("subscriptionBrackets").createIndex({ key: 1 }, { unique: true });
  await db.collection("subscriptionMealPlans").createIndex({ userId: 1, createdAt: -1 });
  await db.collection("subscriptionMealPlans").createIndex({ "credits.date": 1, paymentStatus: 1 });
  // Makes the payment replay guard a database invariant, not just an app check.
  await db
    .collection("subscriptionMealPlans")
    .createIndex(
      { paymentId: 1 },
      { unique: true, partialFilterExpression: { paymentId: { $exists: true } } },
    );
  console.log("  indexes ensured\n");
}

main().catch((e) => {
  console.error(`\n  import failed: ${(e as Error).message}\n`);
  process.exit(1);
});
