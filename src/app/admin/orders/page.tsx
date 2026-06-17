"use client";

import { useState, useEffect } from "react";
import { Table, Select, Button, message } from "antd";
import type { ColumnsType } from "antd/es/table";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
const POLL_INTERVAL_MS = 30_000;

const statusColors: Record<string, string> = {
  pending: "#faad14",
  confirmed: "#1890ff",
  shipped: "#722ed1",
  delivered: "#52c41a",
  cancelled: "#ff4d4f",
  paid: "#52c41a",
  failed: "#ff4d4f",
  refunded: "#faad14",
};

interface OrderItemRow {
  productId: string;
  name: string;
  image?: string;
  quantity: number;
  price: number;
}

interface OrderRow {
  key: string;
  orderNumber: string;
  kotNumber: number | null;
  billNumber: number | null;
  userPhone: string;
  userName: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverLat: number;
  receiverLng: number;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  items: OrderItemRow[];
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchOrders();
    // Refresh in the background so new/updated orders appear without a reload.
    const interval = setInterval(
      () => fetchOrders({ silent: true }),
      POLL_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, []);

  function fetchOrders({ silent = false }: { silent?: boolean } = {}) {
    if (!silent) setLoading(true);
    fetch("/api/admin/orders")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          const mapped: OrderRow[] = data.orders.map(
            (o: Record<string, unknown>) => ({
              key: String(o._id),
              orderNumber: String(o.orderNumber ?? "-"),
              kotNumber: o.kotNumber == null ? null : Number(o.kotNumber),
              billNumber: o.billNumber == null ? null : Number(o.billNumber),
              userPhone: (o.user as { phone?: string })?.phone ?? "-",
              userName: (o.user as { name?: string })?.name ?? "-",
              receiverName: (o.receiver as { name?: string })?.name ?? "-",
              receiverPhone: (o.receiver as { phone?: string })?.phone ?? "-",
              receiverAddress:
                (o.receiver as { address?: string })?.address ?? "-",
              receiverLat: (o.receiver as { lat?: number })?.lat ?? 0,
              receiverLng: (o.receiver as { lng?: number })?.lng ?? 0,
              totalAmount: Number(o.totalAmount ?? 0),
              status: String(o.status ?? ""),
              paymentStatus: String(o.paymentStatus ?? ""),
              createdAt: o.createdAt
                ? new Date(o.createdAt as string).toLocaleString()
                : "-",
              items: Array.isArray(o.orderItems)
                ? (o.orderItems as Array<Record<string, unknown>>).map(
                    (it) => ({
                      productId: String(it.productId ?? ""),
                      name: String(it.name ?? "Unknown product"),
                      image: it.image ? String(it.image) : undefined,
                      quantity: Number(it.quantity ?? 0),
                      price: Number(it.price ?? 0),
                    }),
                  )
                : [],
            }),
          );
          // Shop users don't see failed-payment orders.
          const role =
            typeof window !== "undefined"
              ? localStorage.getItem("adminRole")
              : null;
          setOrders(
            role === "shop"
              ? mapped.filter((o) => o.paymentStatus !== "failed")
              : mapped,
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }

  async function handleUpdate(
    id: string,
    field: "status" | "paymentStatus",
    value: string,
  ) {
    setUpdatingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.key === id
              ? {
                  ...o,
                  [field]: value,
                  kotNumber:
                    data.kotNumber != null
                      ? Number(data.kotNumber)
                      : o.kotNumber,
                }
              : o,
          ),
        );
        message.success("Updated successfully");
      } else {
        message.error(data.message || "Update failed");
      }
    } catch {
      message.error("Update failed");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handlePrintBill(id: string) {
    setUpdatingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, printBill: true }),
      });
      const data = await res.json();
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o.key === id
              ? {
                  ...o,
                  billNumber:
                    data.billNumber != null
                      ? Number(data.billNumber)
                      : o.billNumber,
                }
              : o,
          ),
        );
        message.success("Bill sent to printer");
      } else {
        message.error(data.message || "Failed to queue bill");
      }
    } catch {
      message.error("Failed to queue bill");
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const columns: ColumnsType<OrderRow> = [
    {
      title: "Order #",
      dataIndex: "orderNumber",
      key: "orderNumber",
      width: 140,
    },
    {
      title: "KOT",
      dataIndex: "kotNumber",
      key: "kotNumber",
      width: 70,
      align: "center",
      render: (value: number | null) =>
        value == null ? (
          <span style={{ color: "#bbb" }}>-</span>
        ) : (
          <span style={{ fontWeight: 600 }}>{value}</span>
        ),
    },
    { title: "User", dataIndex: "userName", key: "userName", ellipsis: true },
    { title: "Phone", dataIndex: "userPhone", key: "userPhone", width: 120 },
    {
      title: "Receiver",
      dataIndex: "receiverName",
      key: "receiverName",
      ellipsis: true,
    },
    {
      title: "Receiver Phone",
      dataIndex: "receiverPhone",
      key: "receiverPhone",
      width: 120,
    },
    {
      title: "Address",
      dataIndex: "receiverAddress",
      key: "receiverAddress",
      width: 220,
      ellipsis: true,
      render: (_: string, record: OrderRow) => (
        <div>
          <span style={{ fontSize: 12 }}>{record.receiverAddress}</span>
          {record.receiverLat !== 0 && record.receiverLng !== 0 && (
            <a
              href={`https://www.google.com/maps?q=${record.receiverLat},${record.receiverLng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                fontSize: 11,
                color: "#1890ff",
                marginTop: 2,
              }}
            >
              View on Maps ↗
            </a>
          )}
        </div>
      ),
    },
    {
      title: "Amount (₹)",
      align: "center",
      dataIndex: "totalAmount",
      key: "totalAmount",
      width: 100,
    },
    {
      title: "Order Status",
      dataIndex: "status",
      key: "status",
      width: 160,
      render: (value: string, record: OrderRow) => (
        <Select
          value={value}
          size="small"
          style={{ width: "100%" }}
          loading={updatingIds.has(record.key)}
          onChange={(v) => handleUpdate(record.key, "status", v)}
        >
          {ORDER_STATUSES.map((s) => (
            <Select.Option key={s} value={s}>
              <span
                style={{ color: statusColors[s] ?? "#000", fontWeight: 500 }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: "Payment Status",
      dataIndex: "paymentStatus",
      key: "paymentStatus",
      width: 160,
      render: (value: string, record: OrderRow) => (
        <Select
          value={value}
          size="small"
          style={{ width: "100%" }}
          loading={updatingIds.has(record.key)}
          onChange={(v) => handleUpdate(record.key, "paymentStatus", v)}
        >
          {PAYMENT_STATUSES.map((s) => (
            <Select.Option key={s} value={s}>
              <span
                style={{ color: statusColors[s] ?? "#000", fontWeight: 500 }}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </Select.Option>
          ))}
        </Select>
      ),
    },
    { title: "Created", dataIndex: "createdAt", key: "createdAt", width: 160 },
    {
      title: "Action",
      key: "action",
      width: 200,
      fixed: "right",
      render: (_: unknown, record: OrderRow) => (
        <div style={{ display: "flex", gap: 8 }}>
          {record.status === "pending" && (
            <Button
              type="primary"
              size="small"
              loading={updatingIds.has(record.key)}
              onClick={() => handleUpdate(record.key, "status", "confirmed")}
            >
              Accept
            </Button>
          )}
          <Button
            size="small"
            loading={updatingIds.has(record.key)}
            onClick={() => handlePrintBill(record.key)}
          >
            {record.billNumber == null ? "Print Bill" : "Reprint Bill"}
          </Button>
        </div>
      ),
    },
  ];

  const itemColumns: ColumnsType<OrderItemRow> = [
    {
      title: "",
      dataIndex: "image",
      key: "image",
      width: 56,
      render: (image?: string) =>
        image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            style={{
              width: 40,
              height: 40,
              objectFit: "cover",
              borderRadius: 6,
            }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 6,
              background: "#f0f0f0",
            }}
          />
        ),
    },
    { title: "Product", dataIndex: "name", key: "name" },
    {
      title: "Qty",
      dataIndex: "quantity",
      key: "quantity",
      width: 80,
    },
    {
      title: "Price (₹)",
      dataIndex: "price",
      key: "price",
      width: 110,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: "Line total (₹)",
      key: "lineTotal",
      width: 130,
      render: (_: unknown, item: OrderItemRow) =>
        (item.price * item.quantity).toFixed(2),
    },
  ];

  function expandedRowRender(record: OrderRow) {
    if (!record.items.length) {
      return (
        <div style={{ padding: 12, color: "#888" }}>
          No items on this order.
        </div>
      );
    }
    const itemsTotal = record.items.reduce(
      (sum, it) => sum + it.price * it.quantity,
      0,
    );
    return (
      <Table<OrderItemRow>
        columns={itemColumns}
        dataSource={
          record.items.map((it, idx) => ({
            ...it,
            key: `${record.key}-${idx}`,
          })) as (OrderItemRow & { key: string })[]
        }
        pagination={false}
        size="small"
        rowKey="key"
        summary={() => (
          <Table.Summary.Row>
            <Table.Summary.Cell index={0} colSpan={4}>
              <span style={{ fontWeight: 600 }}>Items total</span>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={1}>
              <span style={{ fontWeight: 600 }}>₹{itemsTotal.toFixed(2)}</span>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">
        Orders ({orders.length})
      </h2>
      <Table
        columns={columns}
        dataSource={orders}
        loading={loading}
        size="small"
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => record.items.length > 0,
        }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} orders`,
        }}
        scroll={{ x: 1690 }}
      />
    </div>
  );
}
