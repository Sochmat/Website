"use client";

import { useCallback, useEffect, useState } from "react";
import { InputNumber, Select, Button, message } from "antd";
import { SOCIETIES } from "@/lib/societies";
import {
  DEFAULT_RULE,
  MAX_FEE,
  MAX_THRESHOLD,
  computeDeliveryFee,
  sanitizeDeliveryFeeConfig,
  type DeliveryFeeRule,
} from "@/lib/deliveryFees";

function RuleEditor({
  rule,
  onChange,
}: {
  rule: DeliveryFeeRule;
  onChange: (next: DeliveryFeeRule) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm text-gray-600">
        <span>Orders under</span>
        <InputNumber
          size="small"
          min={0}
          max={MAX_THRESHOLD}
          step={10}
          precision={0}
          prefix="₹"
          value={rule.threshold}
          onChange={(v) => onChange({ ...rule, threshold: Number(v ?? 0) })}
          style={{ width: 110 }}
        />
        <span>pay a delivery fee of</span>
        <InputNumber
          size="small"
          min={0}
          max={MAX_FEE}
          step={5}
          precision={0}
          prefix="₹"
          value={rule.fee}
          onChange={(v) => onChange({ ...rule, fee: Number(v ?? 0) })}
          style={{ width: 100 }}
        />
      </div>
      <p className="text-xs text-gray-500">
        {rule.fee > 0 ? (
          <>
            A ₹{Math.max(0, rule.threshold - 1)} order pays ₹
            {computeDeliveryFee(Math.max(0, rule.threshold - 1), rule)}; a ₹
            {rule.threshold} order delivers free. Compared against the item total
            before any discount.
          </>
        ) : (
          <>Delivery is free on every order at this rate — the fee is ₹0.</>
        )}
      </p>
    </div>
  );
}

export default function AdminDeliveryFeesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultRule, setDefaultRule] = useState<DeliveryFeeRule>(DEFAULT_RULE);
  /** Locations with their own rule. Absent = inherits the default. */
  const [custom, setCustom] = useState<Record<string, DeliveryFeeRule>>({});

  const applyData = useCallback(
    (rule: DeliveryFeeRule, byLocation: Record<string, DeliveryFeeRule>) => {
      setDefaultRule(rule);
      const next: Record<string, DeliveryFeeRule> = {};
      for (const s of SOCIETIES) {
        if (byLocation[s.id]) next[s.id] = byLocation[s.id];
      }
      setCustom(next);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/delivery-fees", { cache: "no-store" });
      const data = await res.json();
      if (data?.success) {
        applyData(data.default ?? DEFAULT_RULE, data.byLocation ?? {});
      }
    } catch {
      /* ignore */
    }
  }, [applyData]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/delivery-fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sanitizeDeliveryFeeConfig({
            default: defaultRule,
            byLocation: custom,
          }),
        ),
      });
      const data = await res.json();
      if (data?.success) {
        message.success("Delivery fees saved");
        await load();
      } else {
        message.error(data?.message ?? "Failed to save");
      }
    } catch {
      message.error("Failed to save");
    }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-1">Delivery fees</h1>
      <p className="text-sm text-gray-500 mb-6">
        Charge a delivery fee on small orders. The threshold is compared against
        the item total <strong>before</strong> any discount, so a coupon or the
        first-order discount never pushes a customer back under it. Dine-in
        orders are never charged.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <h2 className="text-[#111] font-semibold">Default</h2>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              Used by every location without its own rule, including any location
              added later.
            </p>
            <RuleEditor rule={defaultRule} onChange={setDefaultRule} />
          </div>

          {SOCIETIES.map((s) => {
            const own = custom[s.id];
            return (
              <div
                key={s.id}
                className="bg-white rounded-xl border border-gray-100 shadow-sm p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[#111] font-semibold">{s.name}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{s.sector}</p>
                  </div>
                  <Select
                    size="small"
                    value={own ? "custom" : "default"}
                    style={{ width: 150 }}
                    onChange={(mode) =>
                      setCustom((prev) => {
                        const next = { ...prev };
                        if (mode === "custom") next[s.id] = { ...defaultRule };
                        else delete next[s.id];
                        return next;
                      })
                    }
                    options={[
                      { value: "default", label: "Uses default" },
                      { value: "custom", label: "Custom rule" },
                    ]}
                  />
                </div>

                {own ? (
                  <div className="mt-4">
                    <RuleEditor
                      rule={own}
                      onChange={(next) =>
                        setCustom((prev) => ({ ...prev, [s.id]: next }))
                      }
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-gray-400">
                    {defaultRule.fee > 0
                      ? `₹${defaultRule.fee} under ₹${defaultRule.threshold}`
                      : "Free delivery"}
                  </p>
                )}
              </div>
            );
          })}

          <div className="flex items-center gap-3 pb-4">
            <Button type="primary" loading={saving} onClick={save}>
              Save
            </Button>
            <span className="text-xs text-gray-400">
              Applies to orders placed from now on.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
