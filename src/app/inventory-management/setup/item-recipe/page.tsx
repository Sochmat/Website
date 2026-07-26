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
import ViewItemRecipeModal from "@/components/inventory/ViewItemRecipeModal";
import RecipeImportModal from "@/components/inventory/RecipeImportModal";
import type { ItemRecipe } from "@/lib/itemRecipes";
import { formatCurrency } from "@/lib/rawMaterials";

const SEARCH_DEBOUNCE_MS = 300;
const BASE_PATH = "/inventory-management/setup/item-recipe";

export default function ItemRecipesPage() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<ItemRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [viewing, setViewing] = useState<ItemRecipe | null>(null);
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

  const loadRecipes = useCallback(async () => {
    try {
      const query = appliedSearch.trim()
        ? `?search=${encodeURIComponent(appliedSearch.trim())}`
        : "";
      const res = await fetch(`/api/inventory/item-recipes${query}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data.success) setRecipes(data.recipes ?? []);
    } catch {
      // Leave the previous list on screen rather than blanking it on a blip.
    } finally {
      setLoading(false);
    }
  }, [appliedSearch]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  const handleDelete = (recipe: ItemRecipe) => {
    modal.confirm({
      title: "Delete this item recipe?",
      content: (
        <span>
          <strong>{recipe.name}</strong> and its components will be removed
          permanently.
        </span>
      ),
      okText: "Delete",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: async () => {
        try {
          const res = await fetch(`/api/inventory/item-recipes/${recipe._id}`, {
            method: "DELETE",
          });
          const data = await res.json();
          if (!data.success) {
            messageApi.error(data.message ?? "Could not delete");
            return;
          }
          messageApi.success("Item recipe deleted");
          loadRecipes();
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
      const res = await fetch(`/api/inventory/item-recipes/export${query}`);
      if (!res.ok) {
        messageApi.error("Export failed");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `item-recipes-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
    loadRecipes();
  };

  const columns: ColumnsType<ItemRecipe> = [
    {
      title: "Name",
      dataIndex: "name",
      render: (value: string, row) => (
        <span className="font-medium text-gray-900">
          {value}
          <span className="ml-2 text-xs font-normal text-gray-500">
            {row.lines.length} component{row.lines.length === 1 ? "" : "s"}
          </span>
        </span>
      ),
    },
    {
      title: "Costing",
      dataIndex: "totalCost",
      align: "right",
      width: 180,
      sorter: (a, b) => a.totalCost - b.totalCost,
      render: (value: number) => (
        <span className="whitespace-nowrap tabular-nums text-gray-900">
          {formatCurrency(value)}
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
            aria-label={`View components in ${row.name}`}
            title="View components"
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
            Item Recipe
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            What each menu item is made of — raw materials, production items, or
            both. Costing is calculated from the components.
          </p>
        </div>
        <button
          onClick={() => router.push(`${BASE_PATH}/new`)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
        >
          <PlusOutlined />
          Add Item Recipe
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <SearchOutlined className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            aria-label="Search item recipes by name"
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
          Showing {recipes.length} filtered result
          {recipes.length === 1 ? "" : "s"} — Download Excel exports this view.
        </p>
      )}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <Table<ItemRecipe>
          rowKey={(row) => String(row._id)}
          columns={columns}
          dataSource={recipes}
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
                    ? "No item recipes match that search"
                    : "No item recipes yet"}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {filtersActive
                    ? "Try a different name."
                    : "Add one and build it from raw materials and production items."}
                </p>
                {!filtersActive && (
                  <button
                    onClick={() => router.push(`${BASE_PATH}/new`)}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-2 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
                  >
                    <PlusOutlined />
                    Add Item Recipe
                  </button>
                )}
              </div>
            ),
          }}
        />
      </div>

      <ViewItemRecipeModal
        open={!!viewing}
        recipe={viewing}
        onClose={() => setViewing(null)}
      />

      <RecipeImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onCommitted={handleImported}
        resource="item-recipes"
        title="Upload item recipes"
        noun="item recipe"
      />
    </div>
  );
}
