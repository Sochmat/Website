// An order's lines, flattened into the things it actually sold.
//
// The order-shaped half of stock consumption: turning stored order items and
// their add-ons into a plain list of products and quantities. What that list
// then draws down is src/lib/recipeDemand.ts, which the Petpooja upload shares.
//
// Pure logic — see orderConsumption.test.ts.

import { normalizeMaterialName } from "./rawMaterials";

/** An order line as stored, before its products have been named. */
export interface StoredOrderItem {
  productId?: unknown;
  quantity?: unknown;
  variantName?: unknown;
  addOns?: unknown;
}

/** Something sold, ready to have its name looked up. */
export interface OrderedProduct {
  /** Menu item id. Blank when the line carries only a name — see `name`. */
  productId: string;
  /**
   * The name recorded on the order. Used only when there is no id to resolve
   * against the live menu, so a rename still re-points the recipe match
   * everywhere it can.
   */
  name: string;
  /**
   * The variant ordered, where the line named one. Carried through so the
   * recipe match can pick the size actually sold.
   */
  variantName?: string;
  quantity: number;
}

/**
 * Everything an order sold, add-ons included, summed per product.
 *
 * An add-on is a menu item in its own right — it carries a menu id and can
 * have its own recipe — so it is flattened into the same list as the line it
 * was chosen on. Its quantity is PER UNIT of that line: the cart prices a line
 * as (base + add-ons) × quantity, so two bowls each with one extra papad sold
 * two papads.
 *
 * Quantities that are missing, junk or non-positive contribute nothing.
 */
export function orderedProducts(items: StoredOrderItem[]): OrderedProduct[] {
  const totals = new Map<string, OrderedProduct>();

  const add = (
    productId: string,
    name: string,
    quantity: number,
    variantName?: string,
  ) => {
    // Keyed by id where there is one, so a renamed product still sums as
    // itself; by name otherwise, which is all an id-less add-on has. The
    // variant joins the key: two sizes of one dish are two different recipes,
    // so summing them into one line would lose which was sold.
    const base = productId
      ? `id:${productId}`
      : `name:${normalizeMaterialName(name)}`;
    const key = variantName
      ? `${base}|${normalizeMaterialName(variantName)}`
      : base;

    const existing = totals.get(key);
    if (existing) existing.quantity += quantity;
    else totals.set(key, { productId, name, variantName, quantity });
  };

  for (const item of items) {
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const productId = String(item?.productId ?? "").trim();
    const variantName = String(item?.variantName ?? "").trim() || undefined;
    if (productId) add(productId, "", quantity, variantName);

    const addOns = Array.isArray(item?.addOns)
      ? (item.addOns as Array<{ id?: unknown; name?: unknown; quantity?: unknown }>)
      : [];
    for (const addOn of addOns) {
      const addOnQty = Number(addOn?.quantity);
      if (!Number.isFinite(addOnQty) || addOnQty <= 0) continue;

      const addOnId = String(addOn?.id ?? "").trim();
      const addOnName = String(addOn?.name ?? "").trim();
      // No id and no name is nothing we could ever match a recipe to.
      if (!addOnId && !addOnName) continue;

      add(addOnId, addOnName, addOnQty * quantity);
    }
  }

  return [...totals.values()];
}
