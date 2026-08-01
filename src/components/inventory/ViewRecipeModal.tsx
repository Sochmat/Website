"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Modal, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { EditOutlined, WarningOutlined } from "@ant-design/icons";
import { computeCost, type ProductionItem } from "@/lib/productionItems";
import { componentKey, type StockComponentType } from "@/lib/itemRecipes";
import { formatCurrency } from "@/lib/rawMaterials";
import { useRecipeComponents } from "./useRecipeComponents";

const TYPE_LABEL: Record<StockComponentType, string> = {
  raw: "Raw material",
  production: "Production item",
};

/**
 * Read-only view of a production item's recipe.
 *
 * Costs are recomputed here from current component prices rather than read
 * from a stored figure, so the breakdown always reconciles with what the form
 * would show. Components resolve through the same hook the forms use, so a
 * recipe built on another production item names it rather than showing a gap.
 * The footer's Edit is a shortcut into the full edit page — nothing is
 * editable inline.
 */
export default function ViewRecipeModal({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: ProductionItem | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { optionsByKey, costsByKey } = useRecipeComponents();

  const breakdown = useMemo(() => {
    if (!item) return null;
    return computeCost(
      item.recipe,
      item.batchYieldQty,
      item.unitConversion,
      costsByKey,
    );
  }, [item, costsByKey]);

  const rows = useMemo(() => {
    if (!item || !breakdown) return [];
    return breakdown.lines.map((line) => {
      const key = componentKey(line.refType, line.refId);
      const option = optionsByKey.get(key);
      return {
        key,
        refType: line.refType,
        name: option?.name ?? "(deleted component)",
        categoryName: option?.categoryName ?? "",
        qtyUsed: line.qtyUsed,
        unit: option?.consumptionUnit ?? "",
        cost: line.cost,
        share: line.share,
        found: line.found,
      };
    });
  }, [item, breakdown, optionsByKey]);

  type Row = (typeof rows)[number];

  const columns: ColumnsType<Row> = [
    {
      title: "Component",
      dataIndex: "name",
      render: (value: string, row) => (
        <span className="font-medium text-gray-900">
          {value}
          {!row.found && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              <WarningOutlined /> missing
            </span>
          )}
        </span>
      ),
    },
    {
      title: "Type",
      dataIndex: "refType",
      width: 150,
      render: (value: StockComponentType) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
            value === "production"
              ? "bg-[#024731]/10 text-[#024731]"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          {TYPE_LABEL[value]}
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
      title: "Qty Used",
      dataIndex: "qtyUsed",
      align: "right",
      render: (value: number, row) => (
        <span className="whitespace-nowrap tabular-nums text-gray-700">
          {value.toLocaleString("en-IN")} {row.unit}
        </span>
      ),
    },
    {
      title: "Cost",
      dataIndex: "cost",
      align: "right",
      render: (value: number) => (
        <span className="tabular-nums text-gray-900">{formatCurrency(value)}</span>
      ),
    },
    {
      title: "% of total",
      dataIndex: "share",
      align: "right",
      width: 110,
      render: (value: number) => (
        <span className="tabular-nums text-gray-600">
          {(value * 100).toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={760}
      title={
        item ? (
          <span>
            Recipe for <span className="font-bold">{item.name}</span>
          </span>
        ) : (
          "Recipe"
        )
      }
      footer={[
        <button
          key="close"
          onClick={onClose}
          className="mr-2 rounded-lg border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Close
        </button>,
        <button
          key="edit"
          onClick={() => {
            onClose();
            if (item?._id) {
              router.push(
                `/inventory-management/setup/production/${item._id}/edit`,
              );
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#024731] transition-colors"
        >
          <EditOutlined />
          Edit
        </button>,
      ]}
    >
      {item && breakdown && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
            <span>
              Batch yield:{" "}
              <span className="font-medium text-gray-900">
                {item.batchYieldQty.toLocaleString("en-IN")}{" "}
                {item.consumptionUnit}
              </span>
            </span>
            <span>
              Price:{" "}
              <span className="font-medium text-gray-900">
                {formatCurrency(item.pricePerPurchaseUnit)} / {item.purchaseUnit}
              </span>
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 overflow-hidden">
            <Table<Row>
              columns={columns}
              dataSource={rows}
              pagination={false}
              size="small"
              scroll={{ x: "max-content" }}
              locale={{ emptyText: "This item has no recipe lines." }}
              summary={() =>
                rows.length > 0 ? (
                  <Table.Summary.Row className="bg-gray-50 font-semibold">
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <span className="text-gray-700">Total cost</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">
                      <span className="tabular-nums text-gray-900">
                        {formatCurrency(breakdown.totalRecipeCost)}
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">
                      <span className="tabular-nums text-gray-600">100.0%</span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                ) : null
              }
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
