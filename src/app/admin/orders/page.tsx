"use client";

import { useState, useEffect } from "react";
import { Table, Select, message } from "antd";
import type { ColumnsType } from "antd/es/table";

const ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;
const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;

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

interface OrderRow {
  key: string;
  orderNumber: string;
  userPhone: string;
  userName: string;
  receiverName: string;
  receiverPhone: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchOrders();
  }, []);

  function fetchOrders() {
    setLoading(true);
    fetch("/api/admin/orders")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.orders)) {
          setOrders(
            data.orders.map((o: Record<string, unknown>) => ({
              key: String(o._id),
              orderNumber: String(o.orderNumber ?? "-"),
              userPhone: (o.user as { phone?: string })?.phone ?? "-",
              userName: (o.user as { name?: string })?.name ?? "-",
              receiverName: (o.receiver as { name?: string })?.name ?? "-",
              receiverPhone: (o.receiver as { phone?: string })?.phone ?? "-",
              totalAmount: Number(o.totalAmount ?? 0),
              status: String(o.status ?? ""),
              paymentStatus: String(o.paymentStatus ?? ""),
              createdAt: o.createdAt
                ? new Date(o.createdAt as string).toLocaleString()
                : "-",
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function handleUpdate(
    id: string,
    field: "status" | "paymentStatus",
    value: string
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
          prev.map((o) => (o.key === id ? { ...o, [field]: value } : o))
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

  const columns: ColumnsType<OrderRow> = [
    {
      title: "Order #",
      dataIndex: "orderNumber",
      key: "orderNumber",
      width: 140,
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
      title: "Amount (₹)",
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
              <span style={{ color: statusColors[s] ?? "#000", fontWeight: 500 }}>
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
              <span style={{ color: statusColors[s] ?? "#000", fontWeight: 500 }}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </Select.Option>
          ))}
        </Select>
      ),
    },
    { title: "Created", dataIndex: "createdAt", key: "createdAt", width: 160 },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">
        Orders ({orders.length})
      </h2>
      <Table
        columns={columns}
        dataSource={orders}
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} orders`,
        }}
        scroll={{ x: 1200 }}
      />
    </div>
  );
}
