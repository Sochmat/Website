"use client";

import { useState, useEffect, useRef } from "react";
import { Table, Select, Button, Popconfirm, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { SOCIETIES } from "@/lib/societies";

// Shop delay reminders: replay the alert sound at these minute marks after
// confirmation, while the order is still "confirmed" (not yet out for delivery).
const REMINDER_MARKS = [10, 15, 20];
const REMINDER_GRACE_MIN = 5;
const REMINDER_SOUND = "/sounds/new-order.mp3";
const FIRED_REMINDERS_KEY = "shop_delay_reminders_fired";

function notifyOrderHandled() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("admin:order-handled"));
  }
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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

interface OrderItemAddOn {
  name: string;
  price: number;
  quantity: number;
}

interface OrderItemRow {
  productId: string;
  name: string;
  image?: string;
  quantity: number;
  price: number;
  variantName?: string;
  addOns?: OrderItemAddOn[];
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
  /** Delivery location name (empty for older orders without a society). */
  societyName: string;
  /** True when the order is to a slot-based society (e.g. Zomato office). */
  isSlotOrder: boolean;
  /** Selected delivery slot window, e.g. "12:30–13:00" (empty if none). */
  deliverySlot: string;
  createdAt: string;
  /** Confirmation time in ms (null until accepted); drives the shop timer. */
  confirmedAt: number | null;
  items: OrderItemRow[];
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [isShop, setIsShop] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const reminderAudioRef = useRef<HTMLAudioElement | null>(null);
  const firedRemindersRef = useRef<Set<string>>(new Set());

  // Shop-only setup: role flag, reminder audio, and the already-fired marks
  // (persisted so a reload doesn't replay reminders for the same order).
  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsShop(localStorage.getItem("adminRole") === "shop");
    reminderAudioRef.current = new Audio(REMINDER_SOUND);
    reminderAudioRef.current.preload = "auto";
    try {
      const raw = localStorage.getItem(FIRED_REMINDERS_KEY);
      if (raw) firedRemindersRef.current = new Set(JSON.parse(raw) as string[]);
    } catch {
      // ignore malformed data
    }
  }, []);

  // Tick once a second so the per-order timer counts up (shop panel only).
  useEffect(() => {
    if (!isShop) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [isShop]);

  // Replay the alert sound at T+10/15/20 min while an order is still
  // "confirmed" (i.e. not yet out for delivery). Each mark fires at most once.
  useEffect(() => {
    if (!isShop) return;
    const audio = reminderAudioRef.current;
    let changed = false;
    for (const o of orders) {
      if (o.status !== "confirmed" || !o.confirmedAt) continue;
      const elapsedMin = (now - o.confirmedAt) / 60000;
      for (const mark of REMINDER_MARKS) {
        if (elapsedMin < mark || elapsedMin >= mark + REMINDER_GRACE_MIN)
          continue;
        const key = `${o.key}:${mark}`;
        if (firedRemindersRef.current.has(key)) continue;
        firedRemindersRef.current.add(key);
        changed = true;
        if (audio) {
          try {
            audio.currentTime = 0;
          } catch {
            // ignore
          }
          audio.play().catch(() => {});
        }
      }
    }
    if (changed) {
      try {
        localStorage.setItem(
          FIRED_REMINDERS_KEY,
          JSON.stringify([...firedRemindersRef.current]),
        );
      } catch {
        // ignore
      }
    }
  }, [now, orders, isShop]);

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
              societyName:
                SOCIETIES.find((s) => s.id === o.societyId)?.name ?? "",
              isSlotOrder:
                (SOCIETIES.find((s) => s.id === o.societyId)?.slots.length ??
                  0) > 0,
              deliverySlot: o.deliverySlot ? String(o.deliverySlot) : "",
              createdAt: o.createdAt
                ? new Date(o.createdAt as string).toLocaleString()
                : "-",
              confirmedAt: o.confirmedAt
                ? new Date(o.confirmedAt as string).getTime()
                : null,
              items: Array.isArray(o.orderItems)
                ? (o.orderItems as Array<Record<string, unknown>>).map(
                    (it) => ({
                      productId: String(it.productId ?? ""),
                      name: String(it.name ?? "Unknown product"),
                      image: it.image ? String(it.image) : undefined,
                      quantity: Number(it.quantity ?? 0),
                      price: Number(it.price ?? 0),
                      variantName: it.variantName
                        ? String(it.variantName)
                        : undefined,
                      addOns: Array.isArray(it.addOns)
                        ? (it.addOns as Array<Record<string, unknown>>).map(
                            (a) => ({
                              name: String(a.name ?? ""),
                              price: Number(a.price ?? 0),
                              quantity: Number(a.quantity ?? 0),
                            }),
                          )
                        : undefined,
                    }),
                  )
                : [],
            }),
          );
          // Shop users only see orders whose payment went through (paid, or
          // later refunded). Pending/failed orders stay hidden from the shop.
          const role =
            typeof window !== "undefined"
              ? localStorage.getItem("adminRole")
              : null;
          setOrders(
            role === "shop"
              ? mapped.filter(
                  (o) =>
                    o.paymentStatus === "paid" ||
                    o.paymentStatus === "refunded",
                )
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
        // Accepting/rejecting an order stops the new-order ring.
        if (field === "status") notifyOrderHandled();
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
                  confirmedAt:
                    data.confirmedAt != null
                      ? new Date(data.confirmedAt).getTime()
                      : o.confirmedAt,
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

  async function handleReject(id: string) {
    setUpdatingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reject: true }),
      });
      const data = await res.json();
      if (data.success) {
        // Rejecting an order stops the new-order ring.
        notifyOrderHandled();
        setOrders((prev) =>
          prev.map((o) =>
            o.key === id
              ? {
                  ...o,
                  status: "cancelled",
                  paymentStatus: data.paymentStatus ?? o.paymentStatus,
                }
              : o,
          ),
        );
        message.success(
          data.refunded ? "Order rejected and refunded" : "Order rejected",
        );
      } else {
        message.error(data.message || "Failed to reject order");
      }
    } catch {
      message.error("Failed to reject order");
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
    {
      title: "Receiver",
      dataIndex: "receiverName",
      key: "receiverName",
      width: 160,
      onCell: () => ({
        style: { whiteSpace: "normal", wordBreak: "break-word" },
      }),
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
      width: 260,
      onCell: () => ({
        style: { whiteSpace: "normal", wordBreak: "break-word" },
      }),
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
      title: "Delivery Slot",
      dataIndex: "deliverySlot",
      key: "deliverySlot",
      width: 150,
      render: (_: string, record: OrderRow) =>
        record.deliverySlot ? (
          <div style={{ lineHeight: 1.3 }}>
            <span
              style={{
                display: "inline-block",
                fontSize: 12,
                fontWeight: 600,
                color: "#c2410c",
                background: "#ffe9d8",
                borderRadius: 6,
                padding: "1px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {record.deliverySlot}
            </span>
            {record.societyName && (
              <div style={{ fontSize: 11, color: "#999" }}>
                {record.societyName}
              </div>
            )}
          </div>
        ) : (
          <span style={{ color: "#ccc" }}>—</span>
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
          disabled={isShop}
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
    ...(isShop
      ? ([
          {
            title: "Timer",
            key: "timer",
            width: 90,
            align: "center",
            render: (_: unknown, record: OrderRow) => {
              if (record.status !== "confirmed" || !record.confirmedAt) {
                return <span style={{ color: "#bbb" }}>-</span>;
              }
              const elapsed = now - record.confirmedAt;
              const min = elapsed / 60000;
              const color =
                min >= 20
                  ? "#ff4d4f"
                  : min >= 15
                    ? "#fa541c"
                    : min >= 10
                      ? "#faad14"
                      : "#52c41a";
              return (
                <span
                  style={{
                    fontWeight: 600,
                    color,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatElapsed(elapsed)}
                </span>
              );
            },
          },
        ] as ColumnsType<OrderRow>)
      : []),
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
          disabled={isShop}
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
      width: 300,
      fixed: "right",
      render: (_: unknown, record: OrderRow) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
          {record.status === "confirmed" && (
            <Button
              type="primary"
              size="small"
              loading={updatingIds.has(record.key)}
              onClick={() => handleUpdate(record.key, "status", "shipped")}
            >
              Out for Delivery
            </Button>
          )}
          {record.status === "shipped" && (
            <Button
              type="primary"
              size="small"
              loading={updatingIds.has(record.key)}
              onClick={() => handleUpdate(record.key, "status", "delivered")}
            >
              Delivered
            </Button>
          )}
          {record.status !== "cancelled" && record.status !== "delivered" && (
            <Popconfirm
              title="Reject this order?"
              description={
                record.paymentStatus === "paid"
                  ? "This will refund the customer via Razorpay."
                  : "This will cancel the order."
              }
              okText="Reject"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleReject(record.key)}
            >
              <Button danger size="small" loading={updatingIds.has(record.key)}>
                Reject
              </Button>
            </Popconfirm>
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
    {
      title: "Product",
      dataIndex: "name",
      key: "name",
      render: (name: string, item: OrderItemRow) => (
        <div>
          <div>{name}</div>
          {item.variantName ? (
            <div style={{ fontSize: 12, color: "#888" }}>
              {item.variantName}
            </div>
          ) : null}
          {item.addOns?.map((addOn, idx) => (
            <div key={idx} style={{ fontSize: 12, color: "#888" }}>
              + {addOn.name}
              {addOn.quantity > 1 ? ` × ${addOn.quantity}` : ""}
            </div>
          ))}
        </div>
      ),
    },
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
        rowClassName={(record) => (record.isSlotOrder ? "zomato-order-row" : "")}
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => record.items.length > 0,
        }}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (t) => `Total ${t} orders`,
        }}
        scroll={{ x: isShop ? 2230 : 2140 }}
      />
      <style jsx global>{`
        /* Tint orders placed to a slot-based location (e.g. Zomato office). */
        .zomato-order-row > td {
          background: #fff4ec !important;
        }
        .zomato-order-row > td.ant-table-cell-row-hover {
          background: #ffe9d8 !important;
        }
      `}</style>
    </div>
  );
}
