"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Select, Table, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  PlusOutlined,
  DownloadOutlined,
  UploadOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  TagsOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import RawMaterialFormModal from "@/components/inventory/RawMaterialFormModal";
import RawMaterialImportModal from "@/components/inventory/RawMaterialImportModal";
import LookupListModal from "@/components/inventory/LookupListModal";
import EditableNumberCell from "@/components/inventory/EditableNumberCell";
import {
  formatUnitConversion,
  isLowStock,
  type RawMaterial,
  type RawMaterialBrand,
  type RawMaterialCategory,
} from "@/lib/rawMaterials";

const SEARCH_DEBOUNCE_MS = 300;

export default function RawMaterialPage() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [categories, setCategories] = useState<RawMaterialCategory[]>([]);
  const [brands, setBrands] = useState<RawMaterialBrand[]>([]);
  const [loading, setLoading] = useState(true);

  // `search` is what the user is typing; `appliedSearch` is what the server
  // has been asked for. Debouncing the second keeps every keystroke from
  // becoming a request.
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(false);
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

  /** Filters live in the query string so the table and the export agree. */
  const filterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (appliedSearch.trim()) params.set("search", appliedSearch.trim());
    if (categoryId) params.set("categoryId", categoryId);
    if (brandId) params.set("brandId", brandId);
    return params.toString();
  }, [appliedSearch, categoryId, brandId]);

  const loadMaterials = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/inventory/raw-materials${filterQuery ? `?${filterQuery}` : ""}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (data.success) setMaterials(data.materials ?? []);
    } catch {
      // Leave the previous list on screen rather than blanking it on a blip.
    } finally {
      setLoading(false);
    }
  }, [filterQuery]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/categories", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!data.success) return;
      const next: RawMaterialCategory[] = data.categories ?? [];
      setCategories(next);
      // If the category currently being filtered on was just deleted, drop
      // back to "All Categories" rather than filtering on a dead id.
      setCategoryId((current) =>
        current && !next.some((c) => String(c._id) === current) ? "" : current,
      );
    } catch {
      /* ignore — the filter simply stays as it was */
    }
  }, []);

  const loadBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/brands", { cache: "no-store" });
      const data = await res.json();
      if (!data.success) return;
      const next: RawMaterialBrand[] = data.brands ?? [];
      setBrands(next);
      setBrandId((current) =>
        current && !next.some((b) => String(b._id) === current) ? "" : current,
      );
    } catch {
      /* ignore — the filter simply stays as it was */
    }
  }, []);

  useEffect(() => {
    loadCategories();
    loadBrands();
  }, [loadCategories, loadBrands]);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (material: RawMaterial) => {
    setEditing(material);
    setFormOpen(true);
  };

  const handleSaved = (text: string) => {
    setFormOpen(false);
    setEditing(null);
    messageApi.success(text);
    loadMaterials();
  };

  const handleDelete = (material: RawMaterial) => {
    modal.confirm({
      title: "Delete this raw material?",
      content: (
        <span>
          <strong>{material.name}</strong> will be removed permanently. Recipes
          referencing it will need updating.
        </span>
      ),
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(
            `/api/inventory/raw-materials/${material._id}`,
            { method: "DELETE" },
          );
          const data = await res.json();
          if (!data.success) {
            messageApi.error(data.message ?? "Could not delete");
            return;
          }
          messageApi.success("Raw material deleted");
          loadMaterials();
        } catch {
          messageApi.error("Network error — please try again");
        }
      },
    });
  };

  /** Exports whatever the current filters select; unfiltered exports all. */
  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/inventory/raw-materials/export${filterQuery ? `?${filterQuery}` : ""}`,
      );
      if (!res.ok) {
        messageApi.error("Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `raw-materials-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
    loadMaterials();
  };

  /**
   * Save a single field edited inline in the table.
   *
   * The PUT endpoint validates a whole material, so the untouched fields are
   * sent alongside the changed one. On success the row is patched locally
   * rather than refetching — a refetch would discard any other cell the user
   * has open mid-edit.
   */
  const saveField = async (
    row: RawMaterial,
    field: "pricePerPurchaseUnit" | "alertQty",
    value: number,
  ): Promise<boolean> => {
    try {
      const res = await fetch(`/api/inventory/raw-materials/${row._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: row.name,
          categoryId: row.categoryId,
          brandId: row.brandId ?? "",
          consumptionUnit: row.consumptionUnit,
          purchaseUnit: row.purchaseUnit,
          unitConversion: row.unitConversion,
          pricePerPurchaseUnit: row.pricePerPurchaseUnit,
          alertQty: row.alertQty,
          [field]: value,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        messageApi.error(data.message ?? "Could not save");
        return false;
      }
      setMaterials((current) =>
        current.map((m) =>
          String(m._id) === String(row._id) ? { ...m, [field]: value } : m,
        ),
      );
      messageApi.success("Saved");
      return true;
    } catch {
      messageApi.error("Network error — please try again");
      return false;
    }
  };

  const columns: ColumnsType<RawMaterial> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (name: string, row) => (
        <span className="font-medium text-gray-900">
          {name}
          {isLowStock(row) && (
            <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 align-middle">
              Low stock
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Category",
      dataIndex: "categoryName",
      render: (value: string) =>
        value ? (
          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {value}
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      title: "Brand",
      dataIndex: "brandName",
      render: (value: string) =>
        value ? (
          <span className="text-gray-700">{value}</span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        ),
    },
    {
      title: "Consumption Unit",
      dataIndex: "consumptionUnit",
    },
    {
      title: "Purchase Unit",
      dataIndex: "purchaseUnit",
    },
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
      title: "Price / Purchase Unit",
      dataIndex: "pricePerPurchaseUnit",
      align: "right",
      sorter: (a, b) => a.pricePerPurchaseUnit - b.pricePerPurchaseUnit,
      render: (value: number, row) => (
        <EditableNumberCell
          value={value}
          ariaLabel={`Price per purchase unit for ${row.name}`}
          prefix="₹"
          onSave={(next) => saveField(row, "pricePerPurchaseUnit", next)}
        />
      ),
    },
    {
      title: "Alert Qty",
      dataIndex: "alertQty",
      align: "right",
      sorter: (a, b) => a.alertQty - b.alertQty,
      render: (value: number, row) => (
        <EditableNumberCell
          value={value}
          ariaLabel={`Alert qty for ${row.name}`}
          suffix={row.consumptionUnit}
          onSave={(next) => saveField(row, "alertQty", next)}
        />
      ),
    },
    {
      title: "Actions",
      key: "actions",
      align: "right",
      width: 110,
      render: (_, row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => handleEdit(row)}
            aria-label={`Edit ${row.name}`}
            title="Edit"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#024731] transition-colors"
          >
            <EditOutlined />
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

  const filtersActive = !!appliedSearch.trim() || !!categoryId || !!brandId;

  return (
    <div>
      {modalContextHolder}
      {messageContextHolder}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1c1c1c]">
            Raw Material
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Ingredients and supplies, with purchase-to-consumption conversions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
          >
            <PlusOutlined />
            Add Raw Material
          </button>
          <button
            onClick={() => setCategoriesOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <TagsOutlined />
            Category list
          </button>
          <button
            onClick={() => setBrandsOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ShopOutlined />
            Brand list
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search raw materials by name"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#024731] focus:ring-1 focus:ring-[#024731]"
          />
        </div>

        <Select
          className="min-w-[190px]"
          value={categoryId || ""}
          onChange={setCategoryId}
          aria-label="Filter by category"
          options={[
            { value: "", label: "All Categories" },
            ...categories.map((c) => ({ value: String(c._id), label: c.name })),
          ]}
        />

        <Select
          className="min-w-[170px]"
          value={brandId || ""}
          onChange={setBrandId}
          aria-label="Filter by brand"
          options={[
            { value: "", label: "All Brands" },
            ...brands.map((b) => ({ value: String(b._id), label: b.name })),
          ]}
        />

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
          Showing {materials.length} filtered result
          {materials.length === 1 ? "" : "s"} — Download Excel exports this view.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <Table<RawMaterial>
          rowKey={(row) => String(row._id)}
          columns={columns}
          dataSource={materials}
          loading={loading}
          scroll={{ x: "max-content" }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "50", "100"],
            showTotal: (total, range) =>
              `${range[0]}–${range[1]} of ${total}`,
          }}
          rowClassName={(row) => (isLowStock(row) ? "bg-red-50/60" : "")}
          locale={{
            emptyText: (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-gray-900">
                  {filtersActive
                    ? "No raw materials match those filters"
                    : "No raw materials yet"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {filtersActive
                    ? "Try a different search or category."
                    : "Add one, or upload a spreadsheet to load them in bulk."}
                </p>
                {!filtersActive && (
                  <button
                    onClick={handleAdd}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
                  >
                    <PlusOutlined />
                    Add Raw Material
                  </button>
                )}
              </div>
            ),
          }}
        />
      </div>

      <RawMaterialFormModal
        open={formOpen}
        material={editing}
        categories={categories}
        brands={brands}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={handleSaved}
      />

      <RawMaterialImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCommitted={handleImported}
      />

      <LookupListModal
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        title="Category list"
        endpoint="/api/inventory/categories"
        responseKey="categories"
        label="category"
        addPlaceholder="New category name"
        onChanged={() => {
          // A rename changes the label shown against every material, so
          // refresh the materials too, not just the lookup list.
          loadCategories();
          loadMaterials();
        }}
      />

      <LookupListModal
        open={brandsOpen}
        onClose={() => setBrandsOpen(false)}
        title="Brand list"
        endpoint="/api/inventory/brands"
        responseKey="brands"
        label="brand"
        addPlaceholder="New brand name"
        onChanged={() => {
          loadBrands();
          loadMaterials();
        }}
      />
    </div>
  );
}
