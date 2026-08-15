import { describe, it, expect } from "vitest";
import { salesReportFilename, istTimestampLabel } from "@/lib/reportFilename";

describe("salesReportFilename", () => {
  it("matches the Petpooja export naming, stamped in IST", () => {
    // 13:04:52 UTC on 16 Aug 2026 is 18:34:52 IST the same day.
    const name = salesReportFilename(new Date("2026-08-16T13:04:52Z"));
    expect(name).toBe("Sales_Report_Category_Wise_2026_08_16_18_34_52.xlsx");
  });

  it("zero-pads every component", () => {
    // 00:00:00 UTC on 5 Jan is 05:30:00 IST — single digits throughout.
    expect(salesReportFilename(new Date("2026-01-05T00:00:00Z"))).toBe(
      "Sales_Report_Category_Wise_2026_01_05_05_30_00.xlsx",
    );
  });

  it("rolls to the next IST day across the +05:30 boundary", () => {
    // 19:00 UTC is already 00:30 the following day in India. Naming the file
    // after the UTC date would date a night export to the day before.
    expect(salesReportFilename(new Date("2026-08-16T19:00:00Z"))).toBe(
      "Sales_Report_Category_Wise_2026_08_17_00_30_00.xlsx",
    );
  });

  it("handles the last instant before IST midnight", () => {
    expect(salesReportFilename(new Date("2026-08-16T18:29:59Z"))).toBe(
      "Sales_Report_Category_Wise_2026_08_16_23_59_59.xlsx",
    );
  });

  it("crosses a year boundary in IST, not UTC", () => {
    expect(salesReportFilename(new Date("2026-12-31T20:00:00Z"))).toBe(
      "Sales_Report_Category_Wise_2027_01_01_01_30_00.xlsx",
    );
  });
});

describe("istTimestampLabel", () => {
  it("reads as a date a human would write, with no leading zero on the day", () => {
    expect(istTimestampLabel(new Date("2026-08-16T13:04:52Z"))).toBe(
      "16 Aug 2026, 18:34:52",
    );
    expect(istTimestampLabel(new Date("2026-01-05T00:00:00Z"))).toBe(
      "5 Jan 2026, 05:30:00",
    );
  });
});
