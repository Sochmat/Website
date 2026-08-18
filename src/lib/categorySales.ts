// Category-wise sales rollup for the admin report.
//
// Pure: takes per-order lines plus a category-id -> name map and returns the
// rows the sheet renders. No Mongo, no ExcelJS — the apportionment arithmetic
// is the part worth testing.

/** Where items land when their category can't be resolved. */
export const UNCATEGORIZED = "Uncategorized";

/** One product's contribution to one order. */
export interface OrderLine {
  productId: string;
  quantity: number;
  /** price x quantity, before any discount or tax. */
  revenue: number;
}

/** An order reduced to what the report needs from it. */
export interface ReportOrder {
  /**
   * Every reduction applied to the bill: society + coupon + first-order offer,
   * plus wallet credit and reward points spent against it.
   */
  discount: number;
  tax: number;
  lines: OrderLine[];
}

export interface CategorySalesRow {
  category: string;
  /** Units sold, add-ons counted as sales of the item they are. */
  itemsOrdered: number;
  /** Sum of price x quantity, before discount or tax. */
  netAmount: number;
  discount: number;
  tax: number;
  /** netAmount - discount + tax. */
  totalSales: number;
  /** netAmount - discount. */
  netSales: number;
  /** This category's share of all net sales, 0-100. */
  percentage: number;
}

/** Round to paise. Kept off the running totals so error can't compound. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Roll paid orders up into one row per category.
 *
 * Discount and tax live on the *order*, not the line, so an order spanning two
 * categories has to split them. They are apportioned by each category's share
 * of the order's gross line total — price x quantity summed, before any
 * discount or tax — so a category that made up 30% of what was ordered carries
 * 30% of what came off it.
 *
 * Apportioning on the gross is what keeps the split stable: netting the
 * discount out first would make each category's share depend on the very
 * number being divided.
 */
export function buildCategorySalesReport(
  orders: ReportOrder[],
  categoryOf: Map<string, string>,
): CategorySalesRow[] {
  const totals = new Map<
    string,
    { itemsOrdered: number; netAmount: number; discount: number; tax: number }
  >();

  const bump = (category: string) => {
    let row = totals.get(category);
    if (!row) {
      row = { itemsOrdered: 0, netAmount: 0, discount: 0, tax: 0 };
      totals.set(category, row);
    }
    return row;
  };

  for (const order of orders) {
    // Fold this order's lines into its categories first, so an order with two
    // dishes from one category apportions once rather than twice.
    const byCategory = new Map<string, { quantity: number; revenue: number }>();
    let orderGross = 0;

    for (const line of order.lines) {
      const category = categoryOf.get(line.productId) ?? UNCATEGORIZED;
      const entry = byCategory.get(category) ?? { quantity: 0, revenue: 0 };
      entry.quantity += line.quantity;
      entry.revenue += line.revenue;
      byCategory.set(category, entry);
      orderGross += line.revenue;
    }

    for (const [category, entry] of byCategory) {
      const row = bump(category);
      row.itemsOrdered += entry.quantity;
      row.netAmount += entry.revenue;
      // A zero-gross order (fully free, or priced at 0) has no meaningful way
      // to split anything — its units still count, its money is nil.
      if (orderGross > 0) {
        const share = entry.revenue / orderGross;
        row.discount += order.discount * share;
        row.tax += order.tax * share;
      }
    }
  }

  const rows: CategorySalesRow[] = [...totals.entries()].map(
    ([category, t]) => {
      const netAmount = round2(t.netAmount);
      const discount = round2(t.discount);
      const tax = round2(t.tax);
      return {
        category,
        itemsOrdered: t.itemsOrdered,
        netAmount,
        discount,
        tax,
        netSales: round2(netAmount - discount),
        totalSales: round2(netAmount - discount + tax),
        percentage: 0,
      };
    },
  );

  // Percentage is each category's share of total net sales. Computed from the
  // rounded figures so the column agrees with the one above it on the page.
  const totalNetSales = rows.reduce((sum, r) => sum + r.netSales, 0);
  for (const row of rows) {
    row.percentage =
      totalNetSales === 0 ? 0 : round2((row.netSales / totalNetSales) * 100);
  }

  // A sales report ranks: biggest earner first, with the loose ends last.
  return rows.sort((a, b) => {
    if (a.category === UNCATEGORIZED) return 1;
    if (b.category === UNCATEGORIZED) return -1;
    return b.netSales - a.netSales || a.category.localeCompare(b.category);
  });
}
