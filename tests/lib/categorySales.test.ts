import { describe, it, expect } from "vitest";
import { groupByCategory, UNCATEGORIZED } from "@/lib/categorySales";
import type { ItemSale } from "@/lib/adminItemSales";

function sale(over: Partial<ItemSale> = {}): ItemSale {
  return {
    productId: "p1",
    name: "Item",
    isVeg: true,
    category: "biryani",
    quantity: 1,
    revenue: 100,
    ...over,
  };
}

const NAMES = new Map([
  ["biryani", "Biryani"],
  ["beverages", "Beverages"],
  ["sides", "Sides"],
]);

describe("groupByCategory", () => {
  it("rolls items into their category with subtotals and a grand total", () => {
    const report = groupByCategory(
      [
        sale({ productId: "a", name: "Chicken Biryani", quantity: 42, revenue: 12600 }),
        sale({ productId: "b", name: "Veg Biryani", quantity: 18, revenue: 4320 }),
        sale({
          productId: "c",
          name: "Masala Chai",
          category: "beverages",
          quantity: 95,
          revenue: 2375,
        }),
      ],
      NAMES,
    );

    expect(report.categories.map((c) => c.name)).toEqual([
      "Biryani",
      "Beverages",
    ]);
    expect(report.categories[0]).toMatchObject({ quantity: 60, revenue: 16920 });
    expect(report.categories[1]).toMatchObject({ quantity: 95, revenue: 2375 });
    expect(report.totals).toEqual({ quantity: 155, revenue: 19295 });
  });

  it("orders categories by revenue, and items within a category likewise", () => {
    const report = groupByCategory(
      [
        sale({ productId: "a", name: "Cheap", revenue: 100 }),
        sale({ productId: "b", name: "Rich", revenue: 900 }),
        sale({ productId: "c", category: "beverages", name: "Chai", revenue: 5000 }),
      ],
      NAMES,
    );

    expect(report.categories.map((c) => c.name)).toEqual(["Beverages", "Biryani"]);
    expect(report.categories[1].items.map((i) => i.name)).toEqual(["Rich", "Cheap"]);
  });

  it("keeps sales whose menu item carries no category", () => {
    // The regression this guards: dropping them made the grand total stop
    // reconciling against the order subtotals the report was built from.
    const report = groupByCategory(
      [
        sale({ productId: "a", revenue: 300, quantity: 1 }),
        sale({ productId: "b", name: "Orphan", category: "", revenue: 80, quantity: 2 }),
      ],
      NAMES,
    );

    expect(report.categories).toHaveLength(2);
    expect(report.categories[1].name).toBe(UNCATEGORIZED);
    expect(report.categories[1].items.map((i) => i.name)).toEqual(["Orphan"]);
    expect(report.totals).toEqual({ quantity: 3, revenue: 380 });
  });

  it("treats a category id with no known name as uncategorized", () => {
    // A deleted category still referenced by a menu item.
    const report = groupByCategory(
      [sale({ category: "ghost", revenue: 50, quantity: 1 })],
      NAMES,
    );

    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].name).toBe(UNCATEGORIZED);
    expect(report.totals).toEqual({ quantity: 1, revenue: 50 });
  });

  it("pins uncategorized last however much it earned", () => {
    const report = groupByCategory(
      [
        sale({ category: "", name: "Orphan", revenue: 99999, quantity: 1 }),
        sale({ category: "biryani", name: "Biryani", revenue: 10, quantity: 1 }),
      ],
      NAMES,
    );

    expect(report.categories.map((c) => c.name)).toEqual([
      "Biryani",
      UNCATEGORIZED,
    ]);
  });

  it("merges every uncategorized reason into one bucket", () => {
    const report = groupByCategory(
      [
        sale({ productId: "a", category: "", revenue: 10, quantity: 1 }),
        sale({ productId: "b", category: "ghost", revenue: 20, quantity: 1 }),
      ],
      NAMES,
    );

    expect(report.categories).toHaveLength(1);
    expect(report.categories[0].items).toHaveLength(2);
    expect(report.categories[0].revenue).toBe(30);
  });

  it("reports an empty range as zeroes rather than throwing", () => {
    const report = groupByCategory([], NAMES);
    expect(report.categories).toEqual([]);
    expect(report.totals).toEqual({ quantity: 0, revenue: 0 });
  });
});
