"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, InputNumber, Modal, message } from "antd";
import { Plus, Trash2 } from "lucide-react";
import type { PetpoojaItem } from "@/lib/petpoojaUpload";

interface EditRow {
  /** Local row key — items have no id of their own, and names are editable. */
  key: number;
  name: string;
  qty: number | null;
}

/**
 * Edit a recorded Petpooja entry's item list.
 *
 * Saving reverses the stock this entry originally took and spends the new list
 * instead, so the shelves always match what the entry claims. The re-spend
 * reads today's stock and today's recipes — an entry corrected a week later is
 * costed against the shelf as it stands now, not as it stood then.
 */
export default function PetpoojaEditModal({
  uploadId,
  onClose,
  onSaved,
}: {
  uploadId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nextKey, setNextKey] = useState(0);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/petpooja-uploads/${id}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data?.success) {
        message.error(data?.message ?? "Could not open that entry");
        return;
      }
      const items = (data.upload.items ?? []) as PetpoojaItem[];
      setRows(items.map((item, i) => ({ key: i, name: item.name, qty: item.qty })));
      setNextKey(items.length);
    } catch {
      message.error("Could not open that entry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!uploadId) return;
    void load(uploadId);
  }, [uploadId, load]);

  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey, name: "", qty: 1 }]);
    setNextKey((k) => k + 1);
  };

  const removeRow = (key: number) =>
    setRows((prev) => prev.filter((r) => r.key !== key));

  const editRow = (key: number, patch: Partial<EditRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!uploadId) return;
    // Validate here as well as on the server so a typo costs a round trip
    // rather than a stock movement that has to be undone.
    const items = rows.map((r) => ({ name: r.name.trim(), qty: Number(r.qty) }));
    if (items.length === 0) {
      message.error("An entry needs at least one item — delete it instead.");
      return;
    }
    if (items.some((i) => !i.name)) {
      message.error("Every item needs a name");
      return;
    }
    if (items.some((i) => !Number.isFinite(i.qty) || i.qty <= 0)) {
      message.error("Every quantity must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/petpooja-uploads/${uploadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!data?.success) {
        message.error(data?.message ?? "Could not save that entry");
        return;
      }
      // Same reporting as an upload: a partial result must not read as a whole
      // one. An item with no recipe deducted nothing at all.
      if (data.consumptionError) message.warning(data.consumptionError);
      else {
        const parts = [
          `Saved ${data.totalItems} item${data.totalItems === 1 ? "" : "s"}`,
          `stock re-applied across ${data.stockRows ?? 0} row${data.stockRows === 1 ? "" : "s"}`,
        ];
        if (data.shortfallRows) parts.push(`${data.shortfallRows} short of stock`);
        const unmapped: string[] = data.unmapped ?? [];
        if (unmapped.length) parts.push(`no recipe for ${unmapped.join(", ")}`);
        message.success(parts.join(" · "));
      }
      onSaved();
      onClose();
    } catch {
      message.error("Could not save that entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={!!uploadId}
      onCancel={onClose}
      title="Edit entry"
      width={620}
      okText="Save and re-apply stock"
      onOk={save}
      confirmLoading={saving}
      okButtonProps={{ disabled: loading }}
    >
      <p style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
        Saving puts back the stock this entry originally took, then spends the
        edited list instead. Stock is re-applied against current levels and
        current recipes.
      </p>

      {loading ? (
        <p style={{ color: "#999" }}>Loading…</p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((row) => (
              <div key={row.key} style={{ display: "flex", gap: 8 }}>
                <Input
                  value={row.name}
                  placeholder="Item name"
                  onChange={(e) => editRow(row.key, { name: e.target.value })}
                />
                <InputNumber
                  value={row.qty}
                  min={0}
                  step={1}
                  style={{ width: 110 }}
                  placeholder="Qty"
                  onChange={(v) => editRow(row.key, { qty: v })}
                />
                <Button
                  type="text"
                  danger
                  aria-label={`Remove ${row.name || "item"}`}
                  icon={<Trash2 size={16} />}
                  onClick={() => removeRow(row.key)}
                />
              </div>
            ))}
          </div>

          <Button
            type="dashed"
            icon={<Plus size={16} />}
            onClick={addRow}
            style={{ marginTop: 12 }}
            block
          >
            Add item
          </Button>
        </>
      )}
    </Modal>
  );
}
