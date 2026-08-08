"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, InputNumber, Modal, Select, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined } from "@ant-design/icons";
import type { SellableItem, SellableVariant } from "@/lib/menuRecipes";

/** One line being built in the modal. */
interface DraftLine {
  /** Stable row identity — a line exists before its variant is chosen. */
  id: number;
  nameKey: string;
  name: string;
  /** True when the item's BASE recipe is written; see mappedFor. */
  mapped: boolean;
  /** Sizes offered for this item; empty when it has none. */
  variants: SellableVariant[];
  /** The chosen size; "" until picked, and always "" on an item with none. */
  variantName: string;
  qty: number | null;
}

/** What a line will actually deduct: the size's recipe, or the item's own. */
function mappedFor(line: DraftLine): boolean {
  if (!line.variants.length) return line.mapped;
  const chosen = line.variants.find((v) => v.name === line.variantName);
  // Nothing picked yet says nothing about what will be deducted, so the line
  // is not flagged until it does.
  return chosen ? chosen.mapped : true;
}

/** The pair a line resolves to; two lines may not share one. */
function lineKey(line: DraftLine): string {
  return `${line.nameKey}|${line.variantName}`;
}

/**
 * Bulk Orders Update — record what Petpooja sold without a spreadsheet.
 *
 * The typed twin of the sheet upload: pick items, give each a quantity, save.
 * What lands is the same kind of entry, and it spends stock the same way, so
 * an admin who has the figures in front of them never has to build a file to
 * enter them.
 *
 * An item sold in sizes is picked per size: a Large is a different quantity of
 * the same things, so it deducts its own recipe, and one item may sit on the
 * list once per size it sold in.
 */
export default function BulkOrdersUpdateModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save, with the toast text to show. */
  onSaved: (summary: string, warning?: string) => void;
}) {
  const [items, setItems] = useState<SellableItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);
  const nextId = useRef(0);

  useEffect(() => {
    if (!open) return;
    setLines([]);
    setLoadingItems(true);
    (async () => {
      try {
        const res = await fetch("/api/admin/sellable-items");
        const data = await res.json();
        if (data.success) setItems(data.items as SellableItem[]);
        else message.error(data.message || "Could not load the item list");
      } catch {
        message.error("Could not load the item list");
      } finally {
        setLoadingItems(false);
      }
    })();
  }, [open]);

  /** Item/size pairs already on the list, so none can be entered twice. */
  const chosen = useMemo(() => new Set(lines.map(lineKey)), [lines]);

  /** Items with nothing left to add — every size taken, or already listed. */
  const exhausted = useMemo(() => {
    const done = new Set<string>();
    for (const item of items) {
      const taken = item.variants.length
        ? item.variants.every((v) => chosen.has(`${item.nameKey}|${v.name}`))
        : chosen.has(`${item.nameKey}|`);
      if (taken) done.add(item.nameKey);
    }
    return done;
  }, [items, chosen]);

  function addItem(nameKey: string) {
    const item = items.find((i) => i.nameKey === nameKey);
    if (!item || exhausted.has(nameKey)) return;
    setLines((prev) => [
      ...prev,
      {
        id: nextId.current++,
        nameKey: item.nameKey,
        name: item.name,
        mapped: item.mapped,
        variants: item.variants,
        // An item with sizes is added unsized: which one sold is the admin's
        // to say, and guessing it would put a figure against the wrong recipe.
        variantName: "",
        qty: 1,
      },
    ]);
  }

  function setVariant(id: number, variantName: string) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, variantName } : l)),
    );
  }

  function setQty(id: number, qty: number | null) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l)));
  }

  function removeLine(id: number) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  const totalQty = lines.reduce((sum, l) => sum + (l.qty ?? 0), 0);
  const needsQty = lines.some((l) => !l.qty || l.qty <= 0);
  const needsVariant = lines.some((l) => l.variants.length && !l.variantName);
  const unmappedCount = lines.filter((l) => !mappedFor(l)).length;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/petpooja-uploads/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({
            name: l.name,
            variant: l.variantName,
            qty: l.qty,
          })),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.message || "Could not save that entry");
        return;
      }

      const parts = [
        `Recorded ${data.totalItems} item${data.totalItems === 1 ? "" : "s"}`,
        `${data.stockRows ?? 0} stock row${data.stockRows === 1 ? "" : "s"} deducted`,
      ];
      if (data.shortfallRows) parts.push(`${data.shortfallRows} short of stock`);
      const unmapped: string[] = data.unmapped ?? [];
      if (unmapped.length) parts.push(`no recipe for ${unmapped.join(", ")}`);

      onSaved(parts.join(" · "), data.consumptionError);
      onClose();
    } catch {
      message.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  const columns: ColumnsType<DraftLine & { key: string }> = [
    {
      title: "Item",
      dataIndex: "name",
      key: "name",
      render: (name: string, row) => (
        <span>
          {name}
          {!mappedFor(row) && (
            <Tag color="gold" style={{ marginLeft: 8 }}>
              no recipe
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: "Variant",
      key: "variant",
      width: 180,
      render: (_, row) =>
        // An item with no sizes has nothing to choose, and an empty select
        // would read as one waiting to be filled.
        row.variants.length === 0 ? (
          <span style={{ color: "#bbb" }}>—</span>
        ) : (
          <Select
            value={row.variantName || undefined}
            placeholder="Pick a size"
            status={row.variantName ? undefined : "error"}
            style={{ width: "100%" }}
            onChange={(v: string) => setVariant(row.id, v)}
            options={row.variants.map((v) => ({
              value: v.name,
              label: v.mapped ? v.name : `${v.name} — no recipe`,
              // The same size of the same item twice would be two quantities
              // for one sale; it is added again as its own line instead.
              disabled:
                v.name !== row.variantName &&
                chosen.has(`${row.nameKey}|${v.name}`),
            }))}
          />
        ),
    },
    {
      title: "Qty",
      key: "qty",
      width: 130,
      render: (_, row) => (
        <InputNumber
          min={0}
          step={1}
          value={row.qty}
          status={!row.qty || row.qty <= 0 ? "error" : undefined}
          onChange={(v) => setQty(row.id, v)}
          style={{ width: "100%" }}
        />
      ),
    },
    {
      title: "",
      key: "remove",
      width: 50,
      render: (_, row) => (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          onClick={() => removeLine(row.id)}
        />
      ),
    },
  ];

  const saveLabel =
    lines.length === 0
      ? "Add items to save"
      : needsVariant
        ? "Every item with sizes needs one picked"
        : needsQty
          ? "Every item needs a quantity"
          : `Save ${lines.length} item${lines.length === 1 ? "" : "s"}`;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Bulk Orders Update"
      width={760}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>
          Cancel
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={saving}
          disabled={lines.length === 0 || needsQty || needsVariant}
          onClick={handleSave}
        >
          {saveLabel}
        </Button>,
      ]}
    >
      <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        Pick what Petpooja sold and how many. Items sold in sizes need the size
        picked too. Saving records one entry and deducts the production items
        and raw materials behind each item.
      </p>

      <Select
        showSearch
        value={null}
        placeholder="Search and add an item…"
        loading={loadingItems}
        style={{ width: "100%" }}
        optionFilterProp="label"
        onChange={(v: string) => addItem(v)}
        options={items.map((i) => ({
          value: i.nameKey,
          label: i.variants.length
            ? `${i.name} (${i.variants.length} size${i.variants.length === 1 ? "" : "s"})`
            : i.name,
          disabled: exhausted.has(i.nameKey),
        }))}
        notFoundContent={loadingItems ? "Loading…" : "No matching item"}
      />

      {lines.length > 0 && (
        <Table<DraftLine & { key: string }>
          style={{ marginTop: 16 }}
          columns={columns}
          dataSource={lines.map((l) => ({ ...l, key: String(l.id) }))}
          size="small"
          pagination={lines.length > 10 ? { pageSize: 10 } : false}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}>
                <span style={{ fontWeight: 600 }}>Total</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2}>
                <span style={{ fontWeight: 600 }}>{totalQty}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} />
            </Table.Summary.Row>
          )}
        />
      )}

      {unmappedCount > 0 && (
        <p style={{ marginTop: 12, fontSize: 12, color: "#ad6800" }}>
          {unmappedCount} of these line{unmappedCount === 1 ? " has" : "s have"}{" "}
          no recipe — {unmappedCount === 1 ? "it" : "they"} will be recorded on
          the entry, but nothing will come off the shelf for{" "}
          {unmappedCount === 1 ? "it" : "them"}.
        </p>
      )}
    </Modal>
  );
}
