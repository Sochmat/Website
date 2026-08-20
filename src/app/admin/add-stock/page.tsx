"use client";

import { useEffect, useMemo, useState } from "react";
import { message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ProductionItem } from "@/lib/productionItems";

/**
 * Add Stock — the kitchen's record of a batch cooked in advance.
 *
 * Deliberately narrower than /inventory-management/add-stock, which is the
 * admin's version of the same save: no raw materials, no stock levels, no
 * costing. A chef types how much of something they just made, and that is all
 * the screen is for.
 *
 * The save itself is the shared /api/inventory/stock-additions endpoint, so a
 * batch recorded here spends its recipe's ingredients exactly as one recorded
 * from the admin screen does. Nothing about the stock maths lives here.
 */

/** Stock the save spent, as the API reports it back. */
interface ConsumedRow {
  name: string;
  unit: string;
  shortfall: number;
}

/** One row of the form: an item, and whatever has been typed against it. */
interface ItemRow {
  id: string;
  name: string;
  unit: string;
}

/** Parse a typed quantity. null = not a usable number. */
function parseQty(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function ShopAddStockPage() {
  const [messageApi, messageContextHolder] = message.useMessage();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  // Quantities live here until saved, keyed by item id. Only rows actually
  // being filled in get an entry, so an untouched box renders empty.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/inventory/production-items", {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        if (data.success) {
          setItems(
            (data.items ?? [])
              // Made to order, so there is no shelf of it to add to — it is
              // cooked when the order lands. The API refuses these too; this
              // just keeps them off a screen that could only mislead.
              .filter((i: ProductionItem) => i.onSpot !== true)
              .map((i: ProductionItem) => ({
                id: String(i._id),
                name: i.name,
                unit: i.consumptionUnit,
              })),
          );
        } else {
          messageApi.error(data.message ?? "Could not load items");
        }
      } catch {
        if (!cancelled) messageApi.error("Network error — please reload");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messageApi]);

  const term = search.trim().toLowerCase();
  const visible = useMemo(
    () => items.filter((i) => !term || i.name.toLowerCase().includes(term)),
    [items, term],
  );

  /**
   * Rows with something typed in.
   *
   * Built from ALL items, not the filtered ones — a quantity entered before
   * the search changed must still be saved, not quietly dropped because it
   * scrolled out of view.
   */
  const pending = items.filter((i) => (drafts[i.id] ?? "").trim() !== "");

  // Zero parses fine but is not a batch: it would record history saying
  // nothing was made. Flagged rather than ignored, so a half-typed "0.5" is
  // not silently thrown away either.
  const invalid = pending.filter((i) => {
    const qty = parseQty(drafts[i.id] ?? "");
    return qty === null || qty === 0;
  });

  // Browsers only honour this after a real interaction, but it turns an
  // accidental tab close into a prompt rather than silent data loss.
  const pendingCount = pending.length;
  useEffect(() => {
    if (pendingCount === 0) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingCount]);

  const handleSave = async () => {
    if (pending.length === 0 || saving) return;
    if (invalid.length > 0) {
      messageApi.error(
        `Fix ${invalid.length} quantit${invalid.length === 1 ? "y" : "ies"} first — each must be more than 0.`,
      );
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/inventory/stock-additions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "production",
          updates: pending.map((i) => ({
            id: i.id,
            addQty: parseQty(drafts[i.id] ?? ""),
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? "Could not add stock");
        return;
      }

      setDrafts({});
      const suffix = data.rejected?.length
        ? `, ${data.rejected.length} rejected`
        : "";
      messageApi.success(
        `Recorded ${data.saved} batch${data.saved === 1 ? "" : "es"}${suffix}`,
      );

      // A recipe asking for more than was on record is worth saying out loud:
      // the ingredient stopped at zero, so its count needs attention. The
      // batch still stands — it was cooked either way.
      const short = ((data.consumed ?? []) as ConsumedRow[]).filter(
        (c) => !!c.shortfall,
      );
      if (short.length > 0) {
        messageApi.warning(
          `${short
            .map((c) => `${c.name} was ${c.shortfall} ${c.unit} short`)
            .join("; ")} — stopped at 0. Tell the manager.`,
          8,
        );
      }
    } catch {
      messageApi.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {messageContextHolder}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add Stock</h1>
        <p className="mt-1 text-sm text-gray-500">
          Made a batch in advance? Enter how much you made. Ingredients come off
          stock automatically.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="relative mb-4">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <SearchOutlined />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items"
            className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-[#024731] focus:outline-none focus:ring-1 focus:ring-[#024731]"
          />
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500">
            {items.length === 0
              ? "Nothing to add stock for."
              : "No items match that search."}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {visible.map((item) => {
              const draft = drafts[item.id] ?? "";
              const bad = draft.trim() !== "" && parseQty(draft) === null;
              const zero = draft.trim() !== "" && parseQty(draft) === 0;
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="min-w-0 font-medium text-gray-900">
                    {item.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={draft}
                      onChange={(e) =>
                        setDrafts((current) => ({
                          ...current,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder="0"
                      aria-label={`Quantity of ${item.name} made, in ${item.unit}`}
                      aria-invalid={bad || zero}
                      className={`w-28 rounded-lg border py-2 px-3 text-right text-sm tabular-nums focus:outline-none focus:ring-1 ${
                        bad || zero
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-[#024731] focus:ring-[#024731]"
                      }`}
                    />
                    <span className="w-10 text-sm text-gray-500">
                      {item.unit}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Sticky, so the save is reachable without scrolling back up a long
          list — and only present when there is something to save. */}
      {pending.length > 0 && (
        <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl bg-[#1c1c1c] px-5 py-3.5 text-white shadow-xl">
          <span className="text-sm">
            {pending.length} item{pending.length === 1 ? "" : "s"} ready
            {invalid.length > 0 && (
              <span className="ml-2 text-red-300">
                · {invalid.length} need{invalid.length === 1 ? "s" : ""} a
                quantity above 0
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setDrafts({})}
              disabled={saving}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-gray-200 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || invalid.length > 0}
              className="rounded-lg bg-[#024731] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#036040] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
