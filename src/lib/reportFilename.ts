// Download names for the admin report exports.

import { IST_OFFSET_MIN } from "@/lib/ist";

/**
 * The IST wall-clock stamp a report is named after: YYYY_MM_DD_HH_MM_SS.
 *
 * Shifting the instant by the fixed +05:30 and reading UTC components is the
 * same arithmetic ist.ts uses, and for the same reason — India has had no DST
 * since 1945, so there is nothing for Intl to resolve. ist.ts itself only goes
 * down to minutes, hence the local seconds handling.
 */
function istStamp(now: Date): string {
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    ist.getUTCFullYear(),
    pad(ist.getUTCMonth() + 1),
    pad(ist.getUTCDate()),
    pad(ist.getUTCHours()),
    pad(ist.getUTCMinutes()),
    pad(ist.getUTCSeconds()),
  ].join("_");
}

/**
 * e.g. Sales_Report_Category_Wise_2026_08_16_18_34_52.xlsx
 *
 * Deliberately matches how Petpooja names the same report, so both land in
 * Downloads sorting together and an accountant doesn't have to learn a second
 * convention.
 */
export function salesReportFilename(now: Date): string {
  return `Sales_Report_Category_Wise_${istStamp(now)}.xlsx`;
}

/** The same instant for humans, e.g. "16 Aug 2026, 18:34:52". */
export function istTimestampLabel(now: Date): string {
  const [y, m, d, hh, mm, ss] = istStamp(now).split("_");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}, ${hh}:${mm}:${ss}`;
}
