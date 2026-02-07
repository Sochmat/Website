"use client";

import { useState, useEffect } from "react";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";

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

  useEffect(() => {
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
  }, []);

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
    { title: "Status", dataIndex: "status", key: "status", width: 100 },
    {
      title: "Payment",
      dataIndex: "paymentStatus",
      key: "paymentStatus",
      width: 100,
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
        scroll={{ x: 1000 }}
      />
    </div>
  );
}
