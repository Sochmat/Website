"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ReceiptText } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useLoginPopup } from "@/context/LoginPopupContext";
import { Order } from "@/lib/types";

type ProductSummary = { name: string; image?: string };

export default function MyOrdersPage() {
  const { user, isAuthenticated } = useUser();
  const { openLoginPopup } = useLoginPopup();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [productMap, setProductMap] = useState<Record<string, ProductSummary>>(
    {},
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/menu")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data?.success || !Array.isArray(data.items)) return;
        const map: Record<string, ProductSummary> = {};
        for (const item of data.items as {
          id: string;
          name: string;
          image?: string;
        }[]) {
          map[item.id] = { name: item.name, image: item.image };
        }
        setProductMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      openLoginPopup();
      return;
    }
    if (!user?._id) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orders?userId=${user._id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success && Array.isArray(data.orders)) {
          setOrders(data.orders);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?._id, openLoginPopup]);

  const formatDate = (d?: Date | string) => {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case "delivered":
        return "bg-[#e6f6ef] text-[#00a86e]";
      case "cancelled":
        return "bg-[#fde8e8] text-[#d84545]";
      case "shipped":
      case "confirmed":
        return "bg-[#fff4e5] text-[#f56215]";
      default:
        return "bg-[#f1f1f1] text-[#666]";
    }
  };

  return (
    <main className="min-h-screen bg-[#f6f6f6] max-w-[430px] mx-auto pb-10">
      <div className="bg-white border-b border-[#d9d9d9] flex items-center gap-2 px-4 py-4">
        <Link href="/" className="p-1">
          <ArrowLeft className="w-6 h-6 text-[#111]" />
        </Link>
        <span className="text-[#111] text-lg font-semibold">My Orders</span>
      </div>

      {!isAuthenticated ? (
        <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
          <ReceiptText className="w-20 h-20 text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            Login to see your orders
          </h2>
          <button
            type="button"
            onClick={openLoginPopup}
            className="mt-2 bg-[#f56215] text-white px-6 py-3 rounded-lg font-medium"
          >
            Login
          </button>
        </div>
      ) : loading ? (
        <div className="px-4 pt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-[#e5e5e5] p-4 h-28 animate-pulse"
            />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
          <ReceiptText className="w-20 h-20 text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">
            No orders yet
          </h2>
          <p className="text-gray-500 mb-6">
            Your past orders will show up here.
          </p>
          <Link
            href="/menu"
            className="bg-[#f56215] text-white px-6 py-3 rounded-lg font-medium"
          >
            Browse Menu
          </Link>
        </div>
      ) : (
        <div className="px-4 pt-4 space-y-3">
          {orders.map((order) => {
            const orderKey = String(order._id);
            const itemCount = order.orderItems?.reduce(
              (sum, it) => sum + (Number(it.quantity) || 0),
              0,
            );
            const isOpen = expanded === orderKey;
            return (
              <div
                key={orderKey}
                className="bg-white rounded-xl border border-[#e5e5e5] overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : orderKey)}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[#111] text-sm truncate">
                        {order.orderNumber ||
                          `Order ${String(order._id).slice(-6)}`}
                      </p>
                      <p className="text-xs text-[#737373] mt-0.5">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-1 rounded-full capitalize ${statusColor(
                        order.status,
                      )}`}
                    >
                      {order.status || "pending"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-[#666]">
                      {itemCount} item{itemCount === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#111] text-sm">
                        ₹{order.totalAmount}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#666] transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-[#f0f0f0] px-4 py-3 space-y-3">
                    {order.orderItems?.map((item, idx) => {
                      const product = productMap[item.productId];
                      return (
                        <div
                          key={`${item.productId}-${idx}`}
                          className="flex items-center gap-3"
                        >
                          {product?.image ? (
                            <div className="w-12 h-12 relative rounded-lg overflow-hidden bg-[#f5f5f5] shrink-0">
                              <Image
                                src={product.image}
                                alt={product.name}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-[#f5f5f5] shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[#111] truncate">
                              {product?.name ?? "Item"}
                            </p>
                            <p className="text-xs text-[#737373]">
                              Qty {item.quantity} · ₹{item.price}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-[#111]">
                            ₹{Number(item.price) * Number(item.quantity)}
                          </span>
                        </div>
                      );
                    })}
                    <Link
                      href={`/success?orderId=${order._id}`}
                      className="block text-center text-[#f56215] font-semibold text-sm pt-2"
                    >
                      Track order →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
