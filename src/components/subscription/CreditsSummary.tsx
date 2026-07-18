"use client";

import type { CreditAccounting } from "@/lib/subscriptionSchedule";

export default function CreditsSummary({
  accounting,
  expiresOn,
}: {
  accounting: CreditAccounting;
  expiresOn: string;
}) {
  const used = accounting.scheduled + accounting.delivered;
  const expired = accounting.daysLeft === 0;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-[#111]">
            {used}/{accounting.total} meals scheduled
          </p>
          <p className="text-xs text-[#737373] mt-0.5">
            {accounting.available > 0
              ? `${accounting.available} credit${accounting.available === 1 ? "" : "s"} left`
              : "All credits used"}
          </p>
        </div>
        <div className="text-right">
          <p
            className={`text-xs font-semibold ${expired ? "text-red-600" : "text-[#009940]"}`}
          >
            {expired ? "Expired" : `${accounting.daysLeft} days left`}
          </p>
          {expiresOn && (
            <p className="text-[11px] text-[#737373] mt-0.5">valid to {expiresOn}</p>
          )}
        </div>
      </div>

      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#f56215] rounded-full transition-all"
          style={{ width: `${(used / Math.max(1, accounting.total)) * 100}%` }}
        />
      </div>
    </div>
  );
}
