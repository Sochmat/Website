"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

interface PaymentLog {
  _id: string;
  createdAt: string;
  flow: string;
  stage: string;
  route: string;
  outcome: "success" | "failure" | "info";
  message?: string;
  orderId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  amountPaise?: number;
  expectedAmountPaise?: number;
  paymentStatus?: string;
  error?: string;
  errorCode?: string;
  meta?: Record<string, unknown>;
}

type OutcomeFilter = "all" | "failure" | "success" | "info";

const OUTCOME_STYLE: Record<string, string> = {
  failure: "bg-red-100 text-red-700",
  success: "bg-[rgba(0,153,64,0.12)] text-[#009940]",
  info: "bg-gray-100 text-gray-600",
};

function rupees(paise?: number): string {
  if (paise === undefined) return "—";
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// Stages that mean the order ended up paid — used to badge a whole group "paid".
const TERMINAL_SUCCESS = new Set(["verified", "already-paid", "subscription-paid"]);

function when(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function PaymentLogsPage() {
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [failures24h, setFailures24h] = useState(0);
  const [loading, setLoading] = useState(true);
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [q, setQ] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const toggleGroup = (key: string) =>
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (outcome !== "all") params.set("outcome", outcome);
    if (q.trim()) params.set("q", q.trim());
    (async () => {
      try {
        const res = await fetch(`/api/admin/payment-logs?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && data?.success) {
          setLogs(data.logs);
          setFailures24h(data.failures24h ?? 0);
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [outcome, q, reloadKey]);

  // A payment attempt / order is one razorpayOrderId (falling back to the
  // internal order id). Collapse all its steps into a single row so each order
  // reads as one entry you expand to see the create → verify → … trail.
  const groups = useMemo(() => {
    const byKey = new Map<string, PaymentLog[]>();
    const order: string[] = []; // preserves API sort (newest activity first)
    for (const l of logs) {
      const key = l.razorpayOrderId || l.orderId || l._id;
      if (!byKey.has(key)) {
        byKey.set(key, []);
        order.push(key);
      }
      byKey.get(key)!.push(l);
    }
    return order.map((key) => {
      // Steps oldest → newest so the group reads as the payment's timeline.
      const steps = [...byKey.get(key)!].sort(
        (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
      );
      const latest = steps[steps.length - 1];
      const anyFailure = steps.some((s) => s.outcome === "failure");
      const resolved = steps.some((s) => TERMINAL_SUCCESS.has(s.stage));
      // Final state of the attempt: paid wins, else any failure, else latest.
      const outcome: PaymentLog["outcome"] = resolved
        ? "success"
        : anyFailure
          ? "failure"
          : latest.outcome;
      const find = (f: (s: PaymentLog) => boolean) => steps.find(f);
      return {
        key,
        steps,
        latest,
        outcome,
        anyFailure,
        resolved,
        amountPaise: find((s) => s.amountPaise !== undefined)?.amountPaise,
        orderId: find((s) => !!s.orderId)?.orderId,
        razorpayOrderId: find((s) => !!s.razorpayOrderId)?.razorpayOrderId,
        razorpayPaymentId: find((s) => !!s.razorpayPaymentId)?.razorpayPaymentId,
      };
    });
  }, [logs]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-[#111]">Payment logs</h1>
        <button
          onClick={() => {
            setLoading(true);
            setReloadKey((k) => k + 1);
          }}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
        >
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Every payment step is logged here — the exact route + stage where a payment
        failed, with the error and amounts.{" "}
        {failures24h > 0 && (
          <span className="text-red-600 font-semibold">
            {failures24h} failure{failures24h === 1 ? "" : "s"} in the last 24h.
          </span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1">
          {(["all", "failure", "success", "info"] as OutcomeFilter[]).map((o) => (
            <button
              key={o}
              onClick={() => {
                setLoading(true);
                setOutcome(o);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize ${
                outcome === o ? "bg-[#1c1c1c] text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order / payment id, stage, error…"
          className="flex-1 min-w-[220px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
        {groups.length > 0 && (
          <button
            onClick={() =>
              setExpandedKeys((prev) =>
                prev.size === groups.length
                  ? new Set()
                  : new Set(groups.map((g) => g.key)),
              )
            }
            className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
          >
            {expandedKeys.size === groups.length ? "Collapse all" : "Expand all"}
          </button>
        )}
        <span className="text-sm text-gray-400">
          {groups.length} order{groups.length === 1 ? "" : "s"} · {logs.length} rows
        </span>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-gray-500">No payment logs yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-2 font-medium w-6"></th>
                <th className="py-2 pr-3 font-medium">Time</th>
                <th className="py-2 pr-3 font-medium">Outcome</th>
                <th className="py-2 pr-3 font-medium">Route → stage</th>
                <th className="py-2 pr-3 font-medium">What happened</th>
                <th className="py-2 pr-3 font-medium">Amount</th>
                <th className="py-2 pr-3 font-medium">Ids</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expandedKeys.has(g.key);
                return (
                  <Fragment key={g.key}>
                    {/* Order header — one row per order, click to expand its steps. */}
                    <tr
                      onClick={() => toggleGroup(g.key)}
                      className={`border-b border-gray-200 align-top cursor-pointer hover:bg-gray-50 ${
                        g.outcome === "failure" ? "bg-red-50/60" : "bg-gray-50/40"
                      }`}
                    >
                      <td className="py-2 pr-2 text-gray-400 select-none">
                        {isOpen ? "▾" : "▸"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-gray-600">
                        {when(g.latest.createdAt)}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            OUTCOME_STYLE[g.outcome] ?? "bg-gray-100"
                          }`}
                        >
                          {g.resolved ? "paid" : g.outcome}
                        </span>
                        {g.anyFailure && g.resolved && (
                          <span
                            className="ml-1 text-[10px] text-amber-600"
                            title="recovered after a failed step"
                          >
                            ⚑
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className="text-gray-500">
                          {g.latest.route.replace("/api/payment/", "")}
                        </span>
                        <span className="text-gray-400"> → </span>
                        <span className="font-medium text-[#111]">{g.latest.stage}</span>
                      </td>
                      <td className="py-2 pr-3 max-w-[320px]">
                        <p className="text-[#111]">{g.latest.message ?? "—"}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {g.steps.length} step{g.steps.length === 1 ? "" : "s"}
                          {g.anyFailure && !g.resolved && (
                            <span className="text-red-500"> · has a failure</span>
                          )}
                        </p>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {rupees(g.amountPaise)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500 font-mono">
                        {g.orderId && (
                          <div title="internal order id">o:{g.orderId.slice(-6)}</div>
                        )}
                        {g.razorpayOrderId && <div>rzp:{g.razorpayOrderId.slice(-6)}</div>}
                        {g.razorpayPaymentId && (
                          <div>pay:{g.razorpayPaymentId.slice(-6)}</div>
                        )}
                      </td>
                    </tr>

                    {/* Expanded: the individual steps for this order. */}
                    {isOpen &&
                      g.steps.map((l) => (
                        <tr
                          key={l._id}
                          className={`border-b border-gray-100 align-top ${
                            l.outcome === "failure" ? "bg-red-50/30" : ""
                          }`}
                        >
                          <td className="py-2 pr-2"></td>
                          <td className="py-2 pr-3 whitespace-nowrap text-gray-500 pl-2 border-l-2 border-gray-200">
                            {when(l.createdAt)}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                OUTCOME_STYLE[l.outcome] ?? "bg-gray-100"
                              }`}
                            >
                              {l.outcome}
                            </span>
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <span className="text-gray-500">
                              {l.route.replace("/api/payment/", "")}
                            </span>
                            <span className="text-gray-400"> → </span>
                            <span className="font-medium text-[#111]">{l.stage}</span>
                          </td>
                          <td className="py-2 pr-3 max-w-[320px]">
                            <p className="text-[#111]">{l.message ?? "—"}</p>
                            {l.error && (
                              <p className="text-red-600 text-xs mt-0.5">{l.error}</p>
                            )}
                            {l.paymentStatus && (
                              <p className="text-xs text-gray-500 mt-0.5">
                                razorpay status: <b>{l.paymentStatus}</b>
                              </p>
                            )}
                            {l.expectedAmountPaise !== undefined && (
                              <p className="text-xs text-gray-600 mt-0.5">
                                expected {rupees(l.expectedAmountPaise)} · got{" "}
                                {rupees(l.amountPaise)}
                              </p>
                            )}
                            {l.meta && Object.keys(l.meta).length > 0 && (
                              <pre className="bg-gray-50 rounded p-2 overflow-x-auto text-xs text-gray-600 mt-1">
                                {JSON.stringify(l.meta, null, 1)}
                              </pre>
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {rupees(l.amountPaise)}
                          </td>
                          <td className="py-2 pr-3 text-xs text-gray-400 font-mono">
                            {l.razorpayPaymentId && (
                              <div>pay:{l.razorpayPaymentId.slice(-6)}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
