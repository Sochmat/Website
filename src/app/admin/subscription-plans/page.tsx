"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Popconfirm, Select, message } from "antd";
import { ClockCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { deliveryCutoffLabel, type CreditAccounting } from "@/lib/subscriptionSchedule";
import type { SubscriptionCredit, SubscriptionMealPlan } from "@/lib/types";

type Tab = "plans" | "daily";
type PlanRow = SubscriptionMealPlan & { accounting: CreditAccounting };

// The kitchen/admin should message the day's customers by this IST hour, a
// couple of hours before the noon delivery-day lock. Kept as a constant so the
// reminder time is trivial to shift.
const REMINDER_HOUR_IST = 10;

// Current IST calendar date + hour, TZ-stable regardless of the admin's own
// clock, so the 10 AM reminder fires on India time everywhere.
function istNowParts(now: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

// Weekday label for a yyyy-mm-dd string, computed in a TZ-stable way (parse as
// UTC midnight so the label never drifts a day on the client's local offset).
function formatDate(date?: string): { day: string; weekday: string } | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { day: date, weekday: "" };
  return {
    day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
    weekday: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
  };
}

// Ordered-on date (from the stored `createdAt`, an ISO string over JSON) as a
// readable IST calendar date. Anchored to Asia/Kolkata so it never drifts a day.
function formatOrdered(value?: Date | string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

// The plan's "HH:mm" IST delivery time, shown 12-hour for readability.
function formatTime(hhmm?: string): string {
  if (!hhmm) return "—";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// Ordering for the schedule dropdown: dated credits first (soonest → latest),
// then the undated pool (available, then expired/cancelled) so a reader sees the
// real timeline up top and the leftover credits beneath it.
const STATUS_RANK: Record<string, number> = {
  scheduled: 0,
  delivered: 0,
  available: 1,
  expired: 2,
  cancelled: 2,
};

function sortCredits(credits: SubscriptionCredit[]): SubscriptionCredit[] {
  return [...credits].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 3;
    const rb = STATUS_RANK[b.status] ?? 3;
    if (ra !== rb) return ra - rb;
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return a.id.localeCompare(b.id);
  });
}

const PLAN_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
];

const STATUS_BADGE: Record<string, string> = {
  // credit statuses
  scheduled: "bg-blue-50 text-blue-700 ring-blue-600/20",
  delivered: "bg-green-50 text-[#009940] ring-green-600/20",
  available: "bg-gray-100 text-gray-600 ring-gray-500/20",
  expired: "bg-gray-100 text-gray-400 ring-gray-400/20",
  cancelled: "bg-red-50 text-red-600 ring-red-600/20",
  // plan statuses
  active: "bg-green-50 text-[#009940] ring-green-600/20",
  completed: "bg-gray-100 text-gray-600 ring-gray-500/20",
  // payment statuses
  paid: "bg-green-50 text-[#009940] ring-green-600/20",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  failed: "bg-red-50 text-red-600 ring-red-600/20",
  refunded: "bg-gray-100 text-gray-600 ring-gray-500/20",
};

function Badge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? "bg-gray-100 text-gray-600 ring-gray-500/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  );
}

const STAT_TONE: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700",
  green: "bg-green-50 text-[#009940]",
  gray: "bg-gray-100 text-gray-600",
};

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-md px-2 py-0.5 text-xs ${STAT_TONE[tone] ?? STAT_TONE.gray}`}
    >
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  );
}

function VegDot({ isVeg }: { isVeg?: boolean }) {
  return (
    <span
      className={`w-3 h-3 shrink-0 border-2 ${isVeg ? "border-green-600" : "border-red-600"} inline-flex items-center justify-center`}
      aria-label={isVeg ? "Veg" : "Non-veg"}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`} />
    </span>
  );
}

interface Delivery {
  planId: string;
  creditId: string;
  planNumber: string;
  bracket: string;
  diet: string;
  receiver: { name: string; phone: string; address: string };
  deliveryTime: string;
  itemName?: string;
  protein?: number;
  isVeg?: boolean;
  image?: string;
  status: string;
  locked: boolean;
}

// Builds a wa.me click-to-chat link with an appetite-whetting "your meal is on
// its way" message pre-filled. Returns null when the phone isn't a valid
// 10-digit number (stored numbers are bare 10 digits, no country code), so the
// button can render disabled instead of producing a broken link.
//
// Intentionally emoji-free: the delivery pipeline mangles astral-plane
// characters into replacement boxes on the recipient's phone, so the copy leans
// on wording (and *bold*) to stay lively instead.
function buildWhatsAppLink(d: Delivery): string | null {
  const phone = (d.receiver?.phone || "").replace(/\D/g, "");
  if (phone.length !== 10) return null;

  const name = d.receiver?.name?.trim();
  const item = d.itemName?.trim();
  const time = d.deliveryTime?.trim();
  const image = d.image?.trim();

  const greeting = name ? `Hey ${name}!` : "Hey there!";
  const meal = item ? `*${item}*` : "your Sochmat meal";
  const arrival = time ? `by *${formatTime(time)}*` : "soon";
  const proteinPunch =
    typeof d.protein === "number" && d.protein > 0
      ? ` — a ${d.protein}g-protein punch to fuel your day`
      : "";

  const lines = [
    `${greeting} Hot, fresh & made-to-order: ${meal} is sizzling in our kitchen right now${proteinPunch}.`,
    `It'll be at your door ${arrival}. Keep your appetite ready!`,
  ];
  // A raw image URL on its own line lets WhatsApp render an inline preview.
  if (image) lines.push(`Here's a peek:\n${image}`);
  lines.push("— Team Sochmat");

  const text = lines.join("\n\n");
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}

export default function AdminSubscriptionPlansPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [dayLocked, setDayLocked] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lockedOnly, setLockedOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  // Ticks every minute so the reminder can appear at 10 AM while the page is
  // already open, without a manual refresh.
  const [now, setNow] = useState(() => new Date());
  const [dismissedReminderDate, setDismissedReminderDate] = useState<string | null>(null);
  // Guards the once-per-day auto-reveal so re-checking "Locked only" isn't undone.
  const autoRevealedDate = useRef<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const ist = istNowParts(now);
  const reminderDue =
    tab === "daily" && date === ist.date && ist.hour >= REMINDER_HOUR_IST;
  const showReminder =
    reminderDue && dismissedReminderDate !== ist.date && deliveries.length > 0;

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    const qs =
      tab === "daily" ? `?date=${date}${lockedOnly ? "&lockedOnly=1" : ""}` : "";
    (async () => {
      try {
        const res = await fetch(`/api/admin/subscription-plans${qs}`);
        const data = await res.json();
        if (!cancelled && data?.success) {
          if (tab === "daily") {
            setDeliveries(data.deliveries ?? []);
            setDayLocked(!!data.locked);
          } else {
            setPlans(data.plans ?? []);
          }
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, date, lockedOnly, reloadKey]);

  // At/after 10 AM on today's still-unlocked deliveries, reveal them once so the
  // admin can WhatsApp customers before the noon lock. Guarded per-day so an
  // admin who re-hides them isn't overridden.
  useEffect(() => {
    if (
      reminderDue &&
      !dayLocked &&
      lockedOnly &&
      autoRevealedDate.current !== ist.date
    ) {
      autoRevealedDate.current = ist.date;
      setLoading(true);
      setLockedOnly(false);
    }
  }, [reminderDue, dayLocked, lockedOnly, ist.date]);

  const refresh = () => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch("/api/admin/subscription-plans", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _id: id, status }),
    });
    refresh();
  };

  const deletePlan = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/admin/subscription-plans?id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data?.success) {
        message.success("Plan deleted");
        setPlans((prev) => prev.filter((p) => String(p._id) !== id));
      } else {
        message.error(data?.message ?? "Failed to delete plan");
      }
    } catch {
      message.error("Failed to delete plan");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const markDelivered = async (planId: string, creditId: string) => {
    await fetch("/api/admin/subscription-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId, creditId, action: "deliver" }),
    });
    refresh();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[#111]">Subscription plans</h1>
        {tab === "plans" && !loading && (
          <span className="text-sm text-gray-500">
            {plans.length} plan{plans.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="inline-flex gap-1 mb-5 rounded-xl bg-gray-100 p-1">
        {(["plans", "daily"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              if (t === tab) return;
              setLoading(true);
              setTab(t);
            }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white text-[#111] shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "plans" ? "All plans" : "Daily deliveries"}
          </button>
        ))}
      </div>

      {tab === "daily" && (
        <div className="flex items-center gap-4 mb-4">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setLoading(true);
              setDate(e.target.value);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={lockedOnly}
              onChange={(e) => {
                setLoading(true);
                setLockedOnly(e.target.checked);
              }}
            />
            Locked only
          </label>
        </div>
      )}

      {showReminder && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          closable
          icon={<ClockCircleOutlined />}
          onClose={() => setDismissedReminderDate(ist.date)}
          message="Reminder: WhatsApp today's customers"
          description={`It's past ${REMINDER_HOUR_IST} AM — message today's ${deliveries.length} customer${
            deliveries.length === 1 ? "" : "s"
          } about their delivery using the WhatsApp buttons below.`}
        />
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : tab === "plans" ? (
        <div className="space-y-3">
          {plans.length === 0 && <p className="text-gray-500">No plans yet.</p>}
          {plans.map((p) => {
            const id = String(p._id);
            const isOpen = expanded.has(id);
            const items = sortCredits(p.credits ?? []);
            return (
              <div
                key={id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* Header row — click to expand the schedule */}
                <button
                  type="button"
                  onClick={() => toggleExpanded(id)}
                  aria-expanded={isOpen}
                  className="w-full text-left p-4 hover:bg-gray-50/70 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#111]">{p.planNumber}</span>
                        <Badge status={p.status} />
                        <Badge status={p.paymentStatus} />
                      </div>
                      <p className="text-sm text-[#666] mt-1 truncate">
                        {p.receiver?.name} · {p.receiver?.phone}
                      </p>
                      <p className="text-sm text-[#666] mt-0.5">
                        {p.bracket}g · {p.diet} · ₹{p.pricePerMeal} × {p.mealCount} ={" "}
                        <span className="font-medium text-[#111]">₹{p.totalAmount}</span>
                        {p.expiresOn && (
                          <span className="text-gray-400"> · expires {p.expiresOn}</span>
                        )}
                      </p>
                      <p className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                        <ClockCircleOutlined />
                        Delivery {formatTime(p.deliveryTime)}
                        <span className="text-gray-300">·</span>
                        Ordered {formatOrdered(p.createdAt)}
                      </p>
                    </div>
                    <svg
                      viewBox="0 0 20 20"
                      className={`w-5 h-5 shrink-0 text-gray-400 mt-0.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      aria-hidden="true"
                    >
                      <path d="M5 7.5 10 12.5 15 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* Stat chips */}
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <Stat label="scheduled" value={p.accounting.scheduled} tone="blue" />
                    <Stat label="delivered" value={p.accounting.delivered} tone="green" />
                    <Stat label="available" value={p.accounting.available} tone="gray" />
                  </div>
                </button>

                {/* Schedule dropdown */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                    {items.length === 0 ? (
                      <p className="text-sm text-gray-500 py-1">No credits on this plan.</p>
                    ) : (
                      <ul className="divide-y divide-gray-100">
                        {items.map((c) => {
                          const fmt = formatDate(c.date);
                          return (
                            <li
                              key={c.id}
                              className="flex items-center gap-3 py-2 text-sm first:pt-0 last:pb-0"
                            >
                              {/* Date */}
                              <div className="w-16 shrink-0">
                                {fmt ? (
                                  <>
                                    <div className="font-medium text-[#111] leading-tight">
                                      {fmt.day}
                                    </div>
                                    <div className="text-[11px] text-gray-400 uppercase leading-tight">
                                      {fmt.weekday}
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </div>
                              {/* Item */}
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {c.itemName ? (
                                  <>
                                    <VegDot isVeg={c.isVeg} />
                                    <span className="truncate text-[#111]">{c.itemName}</span>
                                  </>
                                ) : (
                                  <span className="text-gray-400 italic">Unassigned credit</span>
                                )}
                              </div>
                              {/* Protein */}
                              {typeof c.protein === "number" && (
                                <span className="shrink-0 text-[#009940] font-medium tabular-nums">
                                  {c.protein}g
                                </span>
                              )}
                              {/* Status */}
                              <div className="shrink-0">
                                <Badge status={c.status} />
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {/* Plan lifecycle control */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                      <label className="text-xs font-medium text-gray-500">Plan status</label>
                      <Select
                        size="small"
                        value={p.status}
                        onChange={(v) => updateStatus(id, v)}
                        options={PLAN_STATUS_OPTIONS}
                        style={{ width: 140 }}
                      />
                      <Popconfirm
                        title="Delete plan?"
                        description={`Permanently delete ${p.planNumber}. This cannot be undone.`}
                        onConfirm={() => deletePlan(id)}
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                      >
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          loading={deletingIds.has(id)}
                          className="ml-auto"
                        >
                          Delete
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {deliveries.length === 0 && (
            <p className="text-gray-500">
              {lockedOnly && !dayLocked
                ? `Deliveries for ${date} are still editable by customers until 3 hours before each delivery time.`
                : `No deliveries on ${date}.`}
            </p>
          )}
          {deliveries.map((d) => {
            const waLink = buildWhatsAppLink(d);
            return (
            <div
              key={`${d.planId}-${d.creditId}`}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <VegDot isVeg={d.isVeg} />
                  <p className="font-medium text-[#111]">{d.itemName?.trim()}</p>
                </div>
                <p className="text-sm text-[#666] mt-0.5">
                  {d.receiver?.name} · {d.receiver?.phone}
                </p>
                <p className="text-sm text-[#666]">{d.receiver?.address}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#009940] font-medium">{d.protein}g</p>
                <p className="text-sm text-[#666]">{d.deliveryTime}</p>
                {d.status === "delivered" ? (
                  <span className="text-xs text-[#009940] font-semibold">Delivered</span>
                ) : d.locked ? (
                  <button
                    onClick={() => markDelivered(d.planId, d.creditId)}
                    className="mt-1 text-xs bg-[#1c1c1c] text-white px-2 py-1 rounded-lg"
                  >
                    Mark delivered
                  </button>
                ) : (
                  <span className="text-xs text-amber-600">
                    Editable until {deliveryCutoffLabel(d.deliveryTime)}
                  </span>
                )}
                <div className="mt-1">
                  {waLink ? (
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs bg-[#25D366] text-white px-2 py-1 rounded-lg"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3 h-3 fill-current"
                        aria-hidden="true"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.002-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      WhatsApp
                    </a>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 text-xs bg-gray-200 text-gray-400 px-2 py-1 rounded-lg cursor-not-allowed"
                      title="No valid phone number"
                    >
                      WhatsApp
                    </span>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
