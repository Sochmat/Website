"use client";

import { useState, useEffect } from "react";
import { Table } from "antd";
import type { ColumnsType } from "antd/es/table";

interface SubscriptionRow {
  key: string;
  subscriptionNumber: string;
  userPhone: string;
  userName: string;
  receiverName: string;
  receiverPhone: string;
  productId: string;
  quantityOption: string;
  deliveryDate: string;
  deliveryTime: string;
  duration: string;
  frequency: string;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  createdAt: string;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/subscriptions")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.subscriptions)) {
          setSubscriptions(
            data.subscriptions.map((s: Record<string, unknown>) => ({
              key: String(s._id),
              subscriptionNumber: String(s.subscriptionNumber ?? "-"),
              userPhone: (s.user as { phone?: string })?.phone ?? (s.receiver as { phone?: string })?.phone ?? "-",
              userName: (s.user as { name?: string })?.name ?? "-",
              receiverName: (s.receiver as { name?: string })?.name ?? "-",
              receiverPhone: (s.receiver as { phone?: string })?.phone ?? "-",
              productId: String(s.productId ?? "-"),
              quantityOption: String(s.quantityOption ?? "-"),
              deliveryDate: String(s.deliveryDate ?? "-"),
              deliveryTime: String(s.deliveryTime ?? "-"),
              duration: String(s.duration ?? "-"),
              frequency: String(s.frequency ?? "-"),
              totalAmount: Number(s.totalAmount ?? 0),
              status: String(s.status ?? ""),
              paymentStatus: String(s.paymentStatus ?? ""),
              paymentMethod: String(s.paymentMethod ?? ""),
              createdAt: s.createdAt
                ? new Date(s.createdAt as string).toLocaleString()
                : "-",
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const columns: ColumnsType<SubscriptionRow> = [
    {
      title: "Subscription #",
      dataIndex: "subscriptionNumber",
      key: "subscriptionNumber",
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
      title: "Product ID",
      dataIndex: "productId",
      key: "productId",
      width: 100,
    },
    {
      title: "Quantity",
      dataIndex: "quantityOption",
      key: "quantityOption",
      width: 100,
    },
    {
      title: "Delivery Date",
      dataIndex: "deliveryDate",
      key: "deliveryDate",
      width: 120,
    },
    {
      title: "Delivery Time",
      dataIndex: "deliveryTime",
      key: "deliveryTime",
      width: 100,
    },
    {
      title: "Duration",
      dataIndex: "duration",
      key: "duration",
      width: 100,
    },
    {
      title: "Frequency",
      dataIndex: "frequency",
      key: "frequency",
      width: 100,
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
    {
      title: "Payment Method",
      dataIndex: "paymentMethod",
      key: "paymentMethod",
      width: 120,
    },
    { title: "Created", dataIndex: "createdAt", key: "createdAt", width: 160 },
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">
        Subscriptions ({subscriptions.length})
      </h2>
      <Table
        columns={columns}
        dataSource={subscriptions}
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} subscriptions`,
        }}
        scroll={{ x: 1500 }}
      />
    </div>
  );
}
