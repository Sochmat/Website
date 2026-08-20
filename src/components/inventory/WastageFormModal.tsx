"use client";

import { useEffect, useState } from "react";
import { Modal, Segmented, Select } from "antd";
import { formatCurrency } from "@/lib/rawMaterials";
import type { WastageEntry, WastageKind } from "@/lib/wastage";
import { formatQty } from "./VarianceTag";
import { parseQtyDraft, type StockRow } from "./useStockRows";

const KIND_LABEL: Record<WastageKind, string> = {
  raw: "Raw Material",
  production: "Production Item",
};

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-gray-500">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Record one wastage: pick a raw material or a production item, say how much
 * went in the bin, and the quantity comes off the shelf.
 *
 * Quantities are entered in the item's CONSUMPTION unit — the unit recipes and
 * the stock screens already speak in — so the unit is shown beside the field
 * rather than chosen, and there is nothing to convert.
 */
export default function WastageFormModal({
  open,
  rows,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Every raw material and production item, unfiltered. */
  rows: StockRow[];
  onClose: () => void;
  onSaved: (result: {
    wastage: WastageEntry;
    updated: { id: string; kind: WastageKind; currentStock: number };
  }) => void;
}) {
  const [kind, setKind] = useState<WastageKind>("raw");
  const [rowKey, setRowKey] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Start clean every time it opens, so a half-finished entry that was
  // cancelled doesn't reappear as if it were still pending.
  useEffect(() => {
    if (!open) return;
    setKind("raw");
    setRowKey(undefined);
    setQty("");
    setError(null);
  }, [open]);

  const options = rows
    .filter((row) => row.kind === kind)
    .map((row) => ({ value: row.key, label: row.name }));

  const selected = rows.find((row) => row.key === rowKey);
  const parsed = parseQtyDraft(qty);
  const entered = qty.trim() !== "";
  const invalidQty = entered && (parsed === null || parsed === 0);

  // What the wastage is worth, at the rate on record right now. The server
  // prices it again at save time — this is a preview, not the authority.
  const cost =
    selected && parsed !== null && selected.unitCost
      ? parsed * selected.unitCost
      : null;
  // Mirrors buildWastage exactly, so the preview promises what the save does:
  // stock is not floored, and a wastage bigger than the count lands in the red
  // rather than at zero. The excess is flagged here rather than after saving.
  const available = selected?.savedStock ?? 0;
  const remaining = parsed === null ? null : available - parsed;
  const shortfall =
    selected && parsed !== null
      ? Math.max(0, parsed - Math.max(0, available))
      : 0;

  const changeKind = (next: WastageKind) => {
    setKind(next);
    // The selection belongs to the old list; keeping it would leave the field
    // showing an item this tab cannot offer.
    setRowKey(undefined);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!selected) {
      setError("Select an item first");
      return;
    }
    if (parsed === null || parsed === 0) {
      setError("Enter a quantity greater than 0");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory/wastages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: selected.kind, id: selected.id, qty: parsed }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? "Could not record wastage");
        return;
      }
      onSaved({ wastage: data.wastage, updated: data.updated });
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="Record wastage"
      okButtonProps={{ danger: true, disabled: !selected || invalidQty || !entered }}
      confirmLoading={saving}
      title="Record wastage"
      width={520}
      destroyOnHidden
    >
      <div className="mt-4 flex flex-col gap-4">
        <Field label="Type">
          <div className="mt-1.5">
            <Segmented<WastageKind>
              block
              value={kind}
              onChange={changeKind}
              options={[
                { value: "raw", label: KIND_LABEL.raw },
                { value: "production", label: KIND_LABEL.production },
              ]}
            />
          </div>
        </Field>

        <Field
          label={KIND_LABEL[kind]}
          hint={
            selected
              ? `Qty remaining: ${
                  typeof selected.savedStock === "number"
                    ? `${formatQty(selected.savedStock)} ${selected.unit}`
                    : "not tracked"
                }${
                  selected.unitCost
                    ? ` · ${formatCurrency(selected.unitCost)} per ${selected.unit}`
                    : " · no price on record"
                }`
              : "Search by name"
          }
        >
          <Select
            className="w-full mt-0.5"
            value={rowKey}
            onChange={(v) => {
              setRowKey(v);
              setError(null);
            }}
            placeholder={
              options.length
                ? `Select ${KIND_LABEL[kind].toLowerCase()}`
                : `No ${KIND_LABEL[kind].toLowerCase()}s yet`
            }
            options={options}
            disabled={options.length === 0}
            showSearch
            optionFilterProp="label"
            autoFocus
          />
        </Field>

        <Field
          label="Qty wasted"
          error={invalidQty ? "Must be a number greater than 0" : undefined}
          hint={
            selected
              ? `In ${selected.unit} — the unit this item is consumed in`
              : undefined
          }
        >
          <div className="mt-0.5 flex items-center gap-2">
            <input
              className={`${inputClass} text-right tabular-nums ${
                invalidQty ? "border-red-400 ring-1 ring-red-300" : ""
              }`}
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                setError(null);
              }}
              inputMode="decimal"
              placeholder="0"
              aria-label="Quantity wasted"
              aria-invalid={invalidQty || undefined}
            />
            <span className="w-14 shrink-0 text-sm text-gray-600">
              {selected?.unit ?? ""}
            </span>
          </div>
        </Field>

        {/* What the entry means, before it is committed: what it costs and
            where the quantity lands. */}
        {selected && parsed !== null && parsed > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-600">Cost of wastage</span>
              <span className="font-semibold tabular-nums text-red-600">
                {cost === null ? "No price" : formatCurrency(cost)}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span className="text-gray-600">Qty remaining after</span>
              <span
                className={`font-medium tabular-nums ${
                  // A figure about to go into the red is the one thing on this
                  // preview worth catching before the save, not after.
                  (remaining ?? 0) < 0 ? "text-red-600" : "text-gray-900"
                }`}
              >
                {typeof selected.savedStock === "number" || parsed > 0
                  ? `${formatQty(remaining ?? 0)} ${selected.unit}`
                  : "—"}
              </span>
            </div>
            {shortfall > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                Only {formatQty(available)} {selected.unit} is on record —{" "}
                {formatQty(shortfall)} {selected.unit} more than that. The
                quantity goes into the red; check the count.
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
