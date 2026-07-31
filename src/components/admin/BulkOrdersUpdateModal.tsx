"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, InputNumber, Modal, Select, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DeleteOutlined } from "@ant-design/icons";
import type { SellableItem } from "@/lib/menuRecipes";

/** One line being built in the modal. */
interface DraftLine {
  nameKey: string;
  name: string;
  mapped: boolean;
  qty: number | null;
}

/**
 * Bulk Orders Update — record what Petpooja sold without a spreadsheet.
 *
 * The typed twin of the sheet upload: pick items, give each a quantity, save.
 * What lands is the same kind of entry, and it spends stock the same way, so
 * an admin who has the figures in front of them never has to build a file to
 * enter them.
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

  const chosen = useMemo(
    () => new Set(lines.map((l) => l.nameKey)),
    [lines],
  );

  function addItem(nameKey: string) {
    const item = items.find((i) => i.nameKey === nameKey);
    // Already on the list — bump it instead of adding a second row, so one
    // item can never end up with two quantities.
    if (!item || chosen.has(nameKey)) return;
    setLines((prev) => [
      ...prev,
      { nameKey: item.nameKey, name: item.name, mapped: item.mapped, qty: 1 },
    ]);
  }

  function setQty(nameKey: string, qty: number | null) {
    setLines((prev) =>
      prev.map((l) => (l.nameKey === nameKey ? { ...l, qty } : l)),
    );
  }

  function removeLine(nameKey: string) {
    setLines((prev) => prev.filter((l) => l.nameKey !== nameKey));
  }

  const totalQty = lines.reduce((sum, l) => sum + (l.qty ?? 0), 0);
  const incomplete = lines.some((l) => !l.qty || l.qty <= 0);
  const unmappedCount = lines.filter((l) => !l.mapped).length;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/petpooja-uploads/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ name: l.name, qty: l.qty })),
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
          {!row.mapped && (
            <Tag color="gold" style={{ marginLeft: 8 }}>
              no recipe
            </Tag>
          )}
        </span>
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
          onChange={(v) => setQty(row.nameKey, v)}
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
          onClick={() => removeLine(row.nameKey)}
        />
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Bulk Orders Update"
      width={640}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>
          Cancel
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={saving}
          disabled={lines.length === 0 || incomplete}
          onClick={handleSave}
        >
          {lines.length === 0
            ? "Add items to save"
            : incomplete
              ? "Every item needs a quantity"
              : `Save ${lines.length} item${lines.length === 1 ? "" : "s"}`}
        </Button>,
      ]}
    >
      <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        Pick what Petpooja sold and how many. Saving records one entry and
        deducts the production items and raw materials behind each item.
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
          label: i.name,
          disabled: chosen.has(i.nameKey),
        }))}
        notFoundContent={loadingItems ? "Loading…" : "No matching item"}
      />

      {lines.length > 0 && (
        <Table<DraftLine & { key: string }>
          style={{ marginTop: 16 }}
          columns={columns}
          dataSource={lines.map((l) => ({ ...l, key: l.nameKey }))}
          size="small"
          pagination={lines.length > 10 ? { pageSize: 10 } : false}
          summary={() => (
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <span style={{ fontWeight: 600 }}>Total</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1}>
                <span style={{ fontWeight: 600 }}>{totalQty}</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} />
            </Table.Summary.Row>
          )}
        />
      )}

      {unmappedCount > 0 && (
        <p style={{ marginTop: 12, fontSize: 12, color: "#ad6800" }}>
          {unmappedCount} of these item{unmappedCount === 1 ? " has" : "s have"}{" "}
          no recipe — {unmappedCount === 1 ? "it" : "they"} will be recorded on
          the entry, but nothing will come off the shelf for{" "}
          {unmappedCount === 1 ? "it" : "them"}.
        </p>
      )}
    </Modal>
  );
}
