"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal, Popconfirm, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DownloadOutlined, EditOutlined, UploadOutlined } from "@ant-design/icons";
import BulkOrdersUpdateModal from "./BulkOrdersUpdateModal";
import PetpoojaEditModal from "./PetpoojaEditModal";
import type {
  PetpoojaItem,
  PetpoojaRowError,
  PetpoojaStockLine,
  PetpoojaUploadDetail,
  PetpoojaUploadSummary,
} from "@/lib/petpoojaUpload";

/** "27 Jul 2026, 4:35 pm" in IST, wherever the browser happens to be. */
function formatUploadedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** Trigger a browser download from an already-fetched blob. */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type UploadRow = PetpoojaUploadSummary & { key: string };
type UploadDetail = PetpoojaUploadDetail;

/**
 * Petpooja item lists.
 *
 * The website side of this page tracks orders one by one; Petpooja keeps its
 * own record, so what it sold arrives here as a spreadsheet. Each upload is
 * kept whole as one dated entry — never merged into an earlier one — so the
 * list can always be read back exactly as it was given.
 */
export default function PetpoojaUploads() {
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [detail, setDetail] = useState<UploadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/petpooja-uploads");
      const data = await res.json();
      if (data.success) {
        setUploads(
          (data.uploads as PetpoojaUploadSummary[]).map((u) => ({
            ...u,
            key: u._id,
          })),
        );
      } else {
        message.error(data.message || "Failed to load uploads");
      }
    } catch {
      message.error("Failed to load uploads");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function downloadSample() {
    try {
      const res = await fetch("/api/admin/petpooja-uploads/template");
      if (!res.ok) {
        message.error("Could not download the sample file");
        return;
      }
      downloadBlob(await res.blob(), "petpooja-items-sample.xlsx");
    } catch {
      message.error("Could not download the sample file");
    }
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/admin/petpooja-uploads", {
        method: "POST",
        body,
      });
      const data = await res.json();
      if (!data.success) {
        message.error(data.message || "Could not read that file");
        return;
      }
      // Say what the upload did on both counts. A skipped row or an item with
      // no recipe means the entry is less complete than it looks, and a silent
      // partial upload would read as a whole one.
      const parts = [
        `Uploaded ${data.totalItems} item${data.totalItems === 1 ? "" : "s"}`,
        `${data.stockRows ?? 0} stock row${data.stockRows === 1 ? "" : "s"} deducted`,
      ];
      const skipped = Number(data.skippedRows ?? 0);
      if (skipped) parts.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped`);
      if (data.shortfallRows) parts.push(`${data.shortfallRows} short of stock`);
      const unmapped: string[] = data.unmapped ?? [];
      if (unmapped.length) parts.push(`no recipe for ${unmapped.join(", ")}`);

      if (data.consumptionError) message.warning(data.consumptionError);
      else message.success(parts.join(" · "));
      await load();
    } catch {
      message.error("Upload failed — please try again");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(row: UploadRow) {
    setDeletingId(row._id);
    try {
      const res = await fetch(`/api/admin/petpooja-uploads/${row._id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data?.success) {
        message.error(data?.message ?? "Could not delete that entry");
        return;
      }
      const rows = Number(data.restoredRows ?? 0);
      message.success(
        rows > 0
          ? `Entry deleted · stock put back on ${rows} row${rows === 1 ? "" : "s"}`
          : "Entry deleted · no stock had been deducted",
      );
      await load();
    } catch {
      message.error("Could not delete that entry");
    } finally {
      setDeletingId(null);
    }
  }

  async function openDetails(id: string) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/petpooja-uploads/${id}`);
      const data = await res.json();
      if (!data.success) {
        message.error(data.message || "Could not open that upload");
        return;
      }
      setDetail(data.upload as UploadDetail);
    } catch {
      message.error("Could not open that upload");
    } finally {
      setDetailLoading(false);
    }
  }

  const columns: ColumnsType<UploadRow> = [
    {
      title: "Date & time",
      dataIndex: "uploadedAt",
      key: "uploadedAt",
      width: 260,
      render: (value: string, row) => (
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontWeight: 500 }}>{formatUploadedAt(value)}</div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {/* A manual entry has no file to name, so it says what it is. */}
            {row.source === "manual" ? "Bulk Orders Update" : row.fileName} ·{" "}
            {row.uploadedByRole}
          </div>
        </div>
      ),
    },
    {
      title: "Total items",
      dataIndex: "totalItems",
      key: "totalItems",
      width: 200,
      render: (value: number, row) => (
        <div style={{ lineHeight: 1.35 }}>
          <div style={{ fontWeight: 500 }}>
            {value} item{value === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>qty {row.totalQty}</div>
          {row.skippedRows > 0 && (
            <Tag color="orange" style={{ marginTop: 4 }}>
              {row.skippedRows} row{row.skippedRows === 1 ? "" : "s"} skipped
            </Tag>
          )}
        </div>
      ),
    },
    {
      title: "Stock deducted",
      key: "stockRows",
      width: 220,
      render: (_: unknown, row) => {
        if (row.consumptionError) {
          return <Tag color="red">Not deducted</Tag>;
        }
        return (
          <div style={{ lineHeight: 1.35 }}>
            <div>
              {row.stockRows} row{row.stockRows === 1 ? "" : "s"}
            </div>
            {row.shortfallRows > 0 && (
              <Tag color="orange" style={{ marginTop: 4 }}>
                {row.shortfallRows} short of stock
              </Tag>
            )}
            {row.unmapped.length > 0 && (
              <Tag color="gold" style={{ marginTop: 4 }}>
                {row.unmapped.length} item
                {row.unmapped.length === 1 ? "" : "s"} without a recipe
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: "Action",
      key: "action",
      width: 260,
      render: (_: unknown, row) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button
            size="small"
            loading={detailLoading}
            onClick={() => openDetails(row._id)}
          >
            View details
          </Button>
          <Button size="small" onClick={() => setEditingId(row._id)}>
            Edit
          </Button>
          <Popconfirm
            title="Delete this entry?"
            // Deleting moves stock, so the prompt names exactly what is about
            // to be put back rather than asking a generic "are you sure".
            description={
              row.consumptionError || row.stockRows === 0
                ? "No stock was deducted, so nothing will be put back."
                : `Stock will be put back across ${row.stockRows} row${
                    row.stockRows === 1 ? "" : "s"
                  }. This cannot be undone.`
            }
            okText="Delete and restock"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            placement="topRight"
            onConfirm={() => handleDelete(row)}
          >
            <Button size="small" danger loading={deletingId === row._id}>
              Delete
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  const itemColumns: ColumnsType<PetpoojaItem & { key: string }> = [
    { title: "#", key: "index", width: 60, render: (_, __, i) => i + 1 },
    { title: "Item name", dataIndex: "name", key: "name" },
    {
      title: "Variant",
      dataIndex: "variantName",
      key: "variantName",
      width: 160,
      // Blank on an item with no sizes, and on every entry recorded before
      // sizes existed — a dash says so without implying one was missed.
      render: (value: string | undefined) =>
        value || <span style={{ color: "#bbb" }}>—</span>,
    },
    {
      title: "Qty",
      dataIndex: "qty",
      key: "qty",
      width: 100,
      align: "right",
    },
  ];

  const errorColumns: ColumnsType<PetpoojaRowError & { key: string }> = [
    { title: "Row", dataIndex: "rowNumber", key: "rowNumber", width: 80 },
    { title: "Item name", dataIndex: "name", key: "name" },
    { title: "Why it was skipped", dataIndex: "reason", key: "reason" },
  ];

  const stockColumns: ColumnsType<PetpoojaStockLine & { key: string }> = [
    { title: "Name", dataIndex: "name", key: "name" },
    {
      title: "Deducted",
      key: "consumedQty",
      width: 130,
      align: "right",
      render: (_, row) => `${row.consumedQty} ${row.unit}`.trim(),
    },
    {
      title: "Stock left",
      key: "closingStock",
      width: 170,
      align: "right",
      render: (_, row) => (
        <>
          {/* "never counted" is not the same as "had none", so an untracked
              row says so rather than printing a 0 it never held. */}
          {row.previousStock === null ? "—" : row.previousStock} → {row.closingStock}
          {row.shortfall > 0 && (
            <Tag color="orange" style={{ marginLeft: 6 }}>
              {row.shortfall} short
            </Tag>
          )}
        </>
      ),
    },
  ];

  /** One deducted-stock table; nothing at all when that kind was untouched. */
  function stockSection(title: string, lines: PetpoojaStockLine[]) {
    if (!lines.length) return null;
    return (
      <div style={{ marginTop: 20 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</h4>
        <Table<PetpoojaStockLine & { key: string }>
          columns={stockColumns}
          dataSource={lines.map((l, i) => ({ ...l, key: `${l.id}-${i}` }))}
          size="small"
          pagination={lines.length > 10 ? { pageSize: 10 } : false}
        />
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <Button icon={<DownloadOutlined />} onClick={downloadSample}>
          Download sample format
        </Button>
        <Button
          type="primary"
          icon={<UploadOutlined />}
          loading={uploading}
          onClick={() => fileRef.current?.click()}
        >
          Upload items list
        </Button>
        <Button icon={<EditOutlined />} onClick={() => setBulkOpen(true)}>
          Bulk Orders Update
        </Button>
        {/* A plain <a href> would trip @next/next/no-html-link-for-pages and
            next/link would client-navigate instead of downloading, so the
            sample is fetched and saved as a blob — same as the inventory
            console's exports. */}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so picking the same file twice re-triggers onChange.
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />
        <span style={{ fontSize: 12, color: "#888" }}>
          Columns: Item Name, Qty — each entry is saved on its own
        </span>
      </div>

      <BulkOrdersUpdateModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onSaved={(summary, warning) => {
          if (warning) message.warning(warning);
          else message.success(summary);
          load();
        }}
      />

      <PetpoojaEditModal
        uploadId={editingId}
        onClose={() => setEditingId(null)}
        onSaved={load}
      />

      <Table<UploadRow>
        columns={columns}
        dataSource={uploads}
        loading={loading}
        size="small"
        locale={{ emptyText: "No item lists uploaded yet" }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} upload${t === 1 ? "" : "s"}`,
        }}
      />

      <Modal
        open={!!detail}
        onCancel={() => setDetail(null)}
        title={
          detail
            ? `Items recorded on ${formatUploadedAt(detail.uploadedAt)}`
            : "Entry details"
        }
        width={720}
        footer={null}
      >
        {detail && (
          <>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
              <span style={{ fontWeight: 500, color: "#111" }}>
                {detail.source === "manual"
                  ? "Bulk Orders Update"
                  : detail.fileName}
              </span>{" "}
              — {detail.totalItems} item{detail.totalItems === 1 ? "" : "s"},
              total qty {detail.totalQty}
            </p>

            <Table<PetpoojaItem & { key: string }>
              columns={itemColumns}
              dataSource={detail.items.map((item, i) => ({
                ...item,
                key: `${item.nameKey}-${i}`,
              }))}
              size="small"
              pagination={detail.items.length > 15 ? { pageSize: 15 } : false}
              summary={() => (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <span style={{ fontWeight: 600 }}>Total</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <span style={{ fontWeight: 600 }}>{detail.totalQty}</span>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              )}
            />

            {detail.consumptionError && (
              <p style={{ marginTop: 16, fontSize: 13, color: "#cf1322" }}>
                Stock was not deducted for this upload: {detail.consumptionError}
              </p>
            )}

            {detail.unmapped.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Items with no recipe — nothing was deducted for these
                </h4>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {detail.unmapped.map((name) => (
                    <Tag key={name} color="gold">
                      {name}
                    </Tag>
                  ))}
                </div>
              </div>
            )}

            {stockSection("Production items deducted", detail.productionLines)}
            {stockSection("Raw materials deducted", detail.rawLines)}

            {detail.errors.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                  Rows skipped on this upload
                </h4>
                <Table<PetpoojaRowError & { key: string }>
                  columns={errorColumns}
                  dataSource={detail.errors.map((e, i) => ({
                    ...e,
                    key: `${e.rowNumber}-${i}`,
                  }))}
                  size="small"
                  pagination={detail.errors.length > 5 ? { pageSize: 5 } : false}
                />
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
