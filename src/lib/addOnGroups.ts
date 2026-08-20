import type { AddOnCategory } from "./types";

/**
 * Resolving the add-ons a menu item offers.
 *
 * An item reaches its add-ons two ways, and both are live at once:
 *   - `addOns`  — ids picked one by one on the item, charged at the add-on's
 *                 own price
 *   - add-on categories — whole groups, each member charged at the category's
 *                 override price when it sets one. The group owns this mapping
 *                 (it names the items and menu categories it applies to), so
 *                 resolving it means scanning the categories, not reading a
 *                 field off the item.
 *
 * Because one add-on may sit in several categories at *different* prices, the
 * same add-on can legitimately show up more than once on a sheet: "Mayo ₹10"
 * under Sauces and "Mayo ₹0" under Free Extras are two different offers. So the
 * unit of selection is an option (group + add-on + price), not an add-on — hence
 * `AddOnOption.key`, which is what the sheet keys its quantity state by.
 */

/** The plain group holding the item's individually-picked add-ons. */
export const DIRECT_GROUP_KEY = "";
export const DIRECT_GROUP_TITLE = "Add-ons";

export interface AddOnOption<P> {
  /** Unique across the whole sheet: `${groupKey}:${addOnId}`. */
  key: string;
  product: P;
  /** What this add-on costs *in this group*. */
  price: number;
}

export interface AddOnGroup<P> {
  key: string;
  title: string;
  options: AddOnOption<P>[];
}

interface BuildParams<P> {
  /** `menuItems` document id of the item being configured. */
  itemId: string;
  /** The menu category the item sits in (`Category.id`), if any. */
  menuCategoryId?: string;
  addOnIds?: string[];
  /** Every resolvable add-on, keyed by id. Ids missing from it are dropped —
   *  that is how hidden and deleted add-ons fall out. */
  productsById: Map<string, P>;
  /** Every add-on category, already in the order they should be shown in. */
  categories: AddOnCategory[];
}

/** Whether a group is offered on this item — named directly, or through the
 *  menu category the item belongs to. */
export function addOnCategoryAppliesTo(
  category: AddOnCategory,
  itemId: string,
  menuCategoryId?: string,
): boolean {
  if ((category.itemIds ?? []).includes(itemId)) return true;
  return Boolean(
    menuCategoryId && (category.menuCategoryIds ?? []).includes(menuCategoryId),
  );
}

/** Low `sortOrder` first. Documents written before ordering existed have none,
 *  and sort last rather than jumping to the front. */
export function sortAddOnCategories(
  categories: AddOnCategory[],
): AddOnCategory[] {
  return [...categories].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
      (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * Build the ordered groups shown in the add-to-cart sheet: the item's own picks
 * first, then a group per add-on category offered on this item, in the order
 * `categories` arrives in. Empty groups are left out entirely, so a category
 * whose members are all hidden renders nothing rather than a bare heading.
 */
export function buildAddOnGroups<P extends { id: string; price: number }>({
  itemId,
  menuCategoryId,
  addOnIds,
  productsById,
  categories,
}: BuildParams<P>): AddOnGroup<P>[] {
  const groups: AddOnGroup<P>[] = [];

  const direct = dedupe(addOnIds ?? []).flatMap((id) => {
    const product = productsById.get(id);
    if (!product) return [];
    return [
      {
        key: `${DIRECT_GROUP_KEY}:${id}`,
        product,
        price: product.price,
      },
    ];
  });
  if (direct.length) {
    groups.push({
      key: DIRECT_GROUP_KEY,
      title: DIRECT_GROUP_TITLE,
      options: direct,
    });
  }

  for (const category of categories) {
    if (category.hidden) continue;
    if (!addOnCategoryAppliesTo(category, itemId, menuCategoryId)) continue;
    const categoryId = String(category._id);

    const seen = new Set<string>();
    const options: AddOnOption<P>[] = [];
    for (const member of category.members ?? []) {
      // A category listing the same add-on twice is a data slip, not two
      // offers — the second entry would be indistinguishable on screen.
      if (seen.has(member.addOnId)) continue;
      const product = productsById.get(member.addOnId);
      if (!product) continue;
      seen.add(member.addOnId);
      options.push({
        key: `${categoryId}:${member.addOnId}`,
        product,
        price: resolveMemberPrice(member.price, product.price),
      });
    }
    if (options.length) {
      groups.push({ key: categoryId, title: category.name, options });
    }
  }

  return groups;
}

/** An override of 0 is meaningful (a free extra), so only an unset or
 *  non-finite price falls back to the add-on's own. */
export function resolveMemberPrice(
  override: number | undefined | null,
  basePrice: number,
): number {
  const price = Number(override);
  if (override === null || override === undefined || !Number.isFinite(price)) {
    return basePrice;
  }
  return Math.max(0, price);
}

/**
 * The lowest price this add-on can legitimately be sold at anywhere: its own,
 * or any category override that undercuts it.
 *
 * The order API recomputes every line from the database to stop a tampered
 * cart from underpaying. Category overrides mean the add-on's own price is no
 * longer that floor — a ₹0 "Free Extras" mayo would look like an underpayment
 * and get the order rejected. Taking the cheapest legitimate price keeps the
 * check fail-open, exactly like the variant fallback it sits next to.
 */
export function cheapestAddOnPrice(
  addOnId: string,
  basePrice: number,
  categories: AddOnCategory[],
): number {
  let cheapest = basePrice;
  for (const category of categories) {
    for (const member of category.members ?? []) {
      if (member.addOnId !== addOnId) continue;
      const price = resolveMemberPrice(member.price, basePrice);
      if (price < cheapest) cheapest = price;
    }
  }
  return cheapest;
}

/**
 * Turn the admin's ticked tree into the two lists that get stored.
 *
 * A fully ticked menu category is stored as the category itself, not as its
 * items: that is what ticking the parent means, and it is what makes a dish
 * added to that category later inherit the group. Its children are then
 * redundant and are dropped, so the same item is never pinned twice.
 */
export function splitCheckedMapping(
  checkedIds: { menuCategoryIds: string[]; itemIds: string[] },
  menuCategoryOf: (itemId: string) => string | undefined,
): { menuCategoryIds: string[]; itemIds: string[] } {
  const menuCategoryIds = dedupe(checkedIds.menuCategoryIds);
  const covered = new Set(menuCategoryIds);
  const itemIds = dedupe(checkedIds.itemIds).filter(
    (id) => !covered.has(menuCategoryOf(id) ?? ""),
  );
  return { menuCategoryIds, itemIds };
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)));
}
