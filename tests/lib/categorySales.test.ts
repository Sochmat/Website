import { describe, it, expect } from "vitest";
import {
  buildCategorySalesReport,
  UNCATEGORIZED,
  type ReportOrder,
} from "@/lib/categorySales";

const CATEGORIES = new Map([
  ["burger", "Burgers"],
  ["shake", "Shakes"],
  ["salad", "Salads"],
]);

/** An order line: product, quantity, and price x quantity. */
const line = (productId: string, quantity: number, revenue: number) => ({
  productId,
  quantity,
  revenue,
});

const order = (over: Partial<ReportOrder> = {}): ReportOrder => ({
  discount: 0,
  tax: 0,
  lines: [line("burger", 1, 100)],
  ...over,
});

const byName = <T extends { category: string }>(rows: T[]) =>
  Object.fromEntries(rows.map((r) => [r.category, r])) as Record<string, T>;

describe("buildCategorySalesReport", () => {
  it("derives every column from net amount, discount and tax", () => {
    const rows = buildCategorySalesReport(
      [order({ discount: 216.7, tax: 85.88, lines: [line("burger", 7, 1934)] })],
      CATEGORIES,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      category: "Burgers",
      itemsOrdered: 7,
      netAmount: 1934,
      discount: 216.7,
      tax: 85.88,
      netSales: 1717.3, // netAmount - discount
      totalSales: 1803.18, // netAmount - discount + tax
      percentage: 100,
    });
  });

  it("splits an order's discount and tax across its categories by gross share", () => {
    // 300 of 400 is Burgers, so Burgers carries 75% of both.
    const rows = byName(
      buildCategorySalesReport(
        [
          order({
            discount: 100,
            tax: 20,
            lines: [line("burger", 3, 300), line("shake", 1, 100)],
          }),
        ],
        CATEGORIES,
      ),
    );

    expect(rows.Burgers).toMatchObject({
      netAmount: 300,
      discount: 75,
      tax: 15,
      netSales: 225,
    });
    expect(rows.Shakes).toMatchObject({
      netAmount: 100,
      discount: 25,
      tax: 5,
      netSales: 75,
    });
  });

  it("apportions on the gross, so the split ignores discount and tax", () => {
    // A discount big enough to invert the ranking if it were netted out first.
    const rows = byName(
      buildCategorySalesReport(
        [
          order({
            discount: 350,
            tax: 0,
            lines: [line("burger", 1, 300), line("shake", 1, 100)],
          }),
        ],
        CATEGORIES,
      ),
    );

    // Still 75/25 of the 350, not something derived from what's left.
    expect(rows.Burgers.discount).toBe(262.5);
    expect(rows.Shakes.discount).toBe(87.5);
  });

  it("apportions once per category when an order repeats one", () => {
    const rows = byName(
      buildCategorySalesReport(
        [
          order({
            discount: 100,
            tax: 0,
            // Two burgers lines plus a shake: 300 of 400 is still Burgers.
            lines: [
              line("burger", 1, 100),
              line("burger", 2, 200),
              line("shake", 1, 100),
            ],
          }),
        ],
        CATEGORIES,
      ),
    );

    expect(rows.Burgers).toMatchObject({ itemsOrdered: 3, discount: 75 });
    expect(rows.Shakes).toMatchObject({ itemsOrdered: 1, discount: 25 });
  });

  it("accumulates a category across separate orders", () => {
    const rows = byName(
      buildCategorySalesReport(
        [
          order({ discount: 10, tax: 5, lines: [line("burger", 1, 100)] }),
          order({ discount: 20, tax: 10, lines: [line("burger", 2, 200)] }),
        ],
        CATEGORIES,
      ),
    );

    expect(rows.Burgers).toMatchObject({
      itemsOrdered: 3,
      netAmount: 300,
      discount: 30,
      tax: 15,
      netSales: 270,
      totalSales: 285,
    });
  });

  it("gives each category its share of total net sales", () => {
    const rows = byName(
      buildCategorySalesReport(
        [
          order({ lines: [line("burger", 1, 750)] }),
          order({ lines: [line("shake", 1, 250)] }),
        ],
        CATEGORIES,
      ),
    );

    expect(rows.Burgers.percentage).toBe(75);
    expect(rows.Shakes.percentage).toBe(25);
  });

  it("ranks by net sales, biggest earner first", () => {
    const rows = buildCategorySalesReport(
      [
        order({ lines: [line("shake", 1, 100)] }),
        order({ lines: [line("burger", 1, 900)] }),
        order({ lines: [line("salad", 1, 500)] }),
      ],
      CATEGORIES,
    );

    expect(rows.map((r) => r.category)).toEqual(["Burgers", "Salads", "Shakes"]);
  });

  it("keeps sales whose product has no known category, and lists them last", () => {
    // The regression this guards: dropping them made the columns stop
    // reconciling against the orders the report was built from.
    const rows = buildCategorySalesReport(
      [
        order({ lines: [line("burger", 1, 100)] }),
        order({ lines: [line("ghost-product", 2, 900)] }),
      ],
      CATEGORIES,
    );

    expect(rows.map((r) => r.category)).toEqual(["Burgers", UNCATEGORIZED]);
    expect(rows[1]).toMatchObject({ itemsOrdered: 2, netAmount: 900 });
  });

  it("counts units but splits no money on a zero-priced order", () => {
    // Nothing to apportion against, and dividing by the gross would be a
    // divide-by-zero — the units are still real.
    const rows = buildCategorySalesReport(
      [order({ discount: 50, tax: 10, lines: [line("burger", 2, 0)] })],
      CATEGORIES,
    );

    expect(rows[0]).toMatchObject({
      itemsOrdered: 2,
      netAmount: 0,
      discount: 0,
      tax: 0,
    });
  });

  it("reports an empty range as no rows rather than throwing", () => {
    expect(buildCategorySalesReport([], CATEGORIES)).toEqual([]);
  });

  it("reports 0% rather than NaN when nothing was sold for money", () => {
    const rows = buildCategorySalesReport(
      [order({ lines: [line("burger", 1, 0)] })],
      CATEGORIES,
    );
    expect(rows[0].percentage).toBe(0);
  });

  it("rounds money to paise and percentage to two places", () => {
    // A third of 100 apportioned three ways is the classic repeating case.
    const rows = byName(
      buildCategorySalesReport(
        [
          order({
            discount: 100,
            tax: 10,
            lines: [
              line("burger", 1, 100),
              line("shake", 1, 100),
              line("salad", 1, 100),
            ],
          }),
        ],
        CATEGORIES,
      ),
    );

    expect(rows.Burgers.discount).toBe(33.33);
    expect(rows.Burgers.tax).toBe(3.33);
    for (const row of Object.values(rows)) {
      expect(row.percentage).toBe(33.33);
    }
  });
});
