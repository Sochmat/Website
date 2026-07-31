"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import ViewRecipeModal from "@/components/inventory/ViewRecipeModal";
import RecipeImportModal from "@/components/inventory/RecipeImportModal";
import type { ProductionItem } from "@/lib/productionItems";
import { formatCurrency, formatUnitConversion } from "@/lib/rawMaterials";

const SEARCH_DEBOUNCE_MS = 300;
const BASE_PATH = "/inventory-management/setup/production";

export default function ProductionItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ProductionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [viewing, setViewing] = useState<ProductionItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [modal, modalContextHolder] = Modal.useModal();
  const [messageApi, messageContextHolder] = message.useMessage();

  useEffect(() => {
    const timer = window.setTimeout(
      () => setAppliedSearch(search),
      SEARCH_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadItems = useCallback(async () => {
    try {
      const query = appliedSearch.trim()
        ? `?search=${encodeURIComponent(appliedSearch.trim())}`
        : "";
      const res = await fetch(`/api/inventory/production-items${query}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) setItems(data.items ?? []);
    } catch {
      // Leave the previous list on screen rather than blanking it on a blip.
    } finally {
      setLoading(false);
    }
  }, [appliedSearch]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleDelete = (item: ProductionItem) => {
    modal.confirm({
      title: "Delete this production item?",
      content: (
        <span>
          <strong>{item.name}</strong> and its recipe will be removed
          permanently.
        </span>
      ),
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(
            `/api/inventory/production-items/${item._id}`,
            { method: "DELETE" },
          );
          const data = await res.json();
          if (!data.success) {
            messageApi.error(data.message ?? "Could not delete");
            return;
          }
          messageApi.success("Production item deleted");
          loadItems();
        } catch {
          messageApi.error("Network error — please try again");
        }
      },
    });
  };

  /** Exports whatever the current search selects; unfiltered exports all. */
  const handleExport = async () => {
    setExporting(true);
    try {
      const query = appliedSearch.trim()
        ? `?search=${encodeURIComponent(appliedSearch.trim())}`
        : "";
      const res = await fetch(`/api/inventory/production-items/export${query}`);
      if (!res.ok) {
        messageApi.error("Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `production-items-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      messageApi.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleImported = (text: string) => {
    setImportOpen(false);
    messageApi.success(`Import complete — ${text}`);
    loadItems();
  };

  const columns: ColumnsType<ProductionItem> = [
    {
      title: "Item Name",
      dataIndex: "name",
      render: (value: string) => (
        <span className="font-medium text-gray-900">{value}</span>
      ),
    },
    {
      title: "Price",
      dataIndex: "pricePerPurchaseUnit",
      align: "right",
      sorter: (a, b) => a.pricePerPurchaseUnit - b.pricePerPurchaseUnit,
      render: (value: number, row) => (
        <span className="whitespace-nowrap tabular-nums text-gray-900">
          {formatCurrency(value)}
          <span className="text-gray-500"> / {row.purchaseUnit}</span>
        </span>
      ),
    },
    { title: "Purchase Unit", dataIndex: "purchaseUnit" },
    { title: "Consumption Unit", dataIndex: "consumptionUnit" },
    {
      title: "Unit Conversion",
      dataIndex: "unitConversion",
      render: (_: number, row) => (
        <span className="whitespace-nowrap text-gray-700">
          {formatUnitConversion(row)}
        </span>
      ),
    },
    {
      title: "Qty",
      dataIndex: "batchYieldQty",
      align: "right",
      sorter: (a, b) => a.batchYieldQty - b.batchYieldQty,
      render: (value: number, row) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700">
          {value.toLocaleString("en-IN")} {row.consumptionUnit}
        </span>
      ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "right",
      width: 140,
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => router.push(`${BASE_PATH}/${row._id}/edit`)}
            aria-label={`Edit ${row.name}`}
            title="Edit"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
          >
            <EditOutlined />
          </button>
          <button
            onClick={() => setViewing(row)}
            aria-label={`View recipe for ${row.name}`}
            title="View recipe"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
          >
            <UnorderedListOutlined />
          </button>
          <button
            onClick={() => handleDelete(row)}
            aria-label={`Delete ${row.name}`}
            title="Delete"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <DeleteOutlined />
          </button>
        </div>
      ),
    },
  ];

  const filtersActive = !!appliedSearch.trim();

  return (
    <div>
      {modalContextHolder}
      {messageContextHolder}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
            Production
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Items the kitchen makes from raw materials. Prices are calculated
            from each recipe.
          </p>
        </div>
        <button
          onClick={() => router.push(`${BASE_PATH}/new`)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
        >
          <PlusOutlined />
          Add Production Item
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by item name…"
            aria-label="Search production items by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          <DownloadOutlined />
          {exporting ? "Preparing…" : "Download Excel"}
        </button>

        <button
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <UploadOutlined />
          Upload Excel
        </button>
      </div>

      {filtersActive && !loading && (
        <p className="mt-3 text-xs text-gray-500">
          Showing {items.length} filtered result{items.length === 1 ? "" : "s"} —
          Download Excel exports this view.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <Table<ProductionItem>
          rowKey={(row) => String(row._id)}
          columns={columns}
          dataSource={items}
          loading={loading}
          scroll={{ x: "max-content" }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
          }}
          locale={{
            emptyText: (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-gray-900">
                  {filtersActive
                    ? "No production items match that search"
                    : "No production items yet"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {filtersActive
                    ? "Try a different name."
                    : "Add one and build its recipe from your raw materials."}
                </p>
                {!filtersActive && (
                  <button
                    onClick={() => router.push(`${BASE_PATH}/new`)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
                  >
                    <PlusOutlined />
                    Add Production Item
                  </button>
                )}
              </div>
            ),
          }}
        />
      </div>

      <ViewRecipeModal
        open={!!viewing}
        item={viewing}
        onClose={() => setViewing(null)}
      />

      <RecipeImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCommitted={handleImported}
        resource="production-items"
        title="Upload production items"
        noun="production item"
      />
    </div>
  );
}
