import type { AddOnCategory, AddOnSelectionType } from "./types";

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
  /** Starts at quantity 1 in the sheet; the customer can still remove it. */
  defaultSelected?: boolean;
}

export interface AddOnGroup<P> {
  key: string;
  title: string;
  /** At least one option must be taken before the item can be added. */
  required?: boolean;
  /** How the sheet renders the options — radio, checkbox or quantity
   *  stepper. See AddOnSelectionType. */
  selectionType: AddOnSelectionType;
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
      // The item's own add-ons belong to no category, so there is nothing to
      // carry a type: they keep the quantity stepper they have always had.
      selectionType: "add",
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
        defaultSelected: Boolean(member.defaultSelected),
      });
    }
    if (options.length) {
      groups.push({
        key: categoryId,
        title: category.name,
        // A group with no resolvable options is dropped above, so `required`
        // can never strand the sheet on a heading the customer cannot satisfy.
        required: Boolean(category.required),
        selectionType: resolveSelectionType(category),
        options,
      });
    }
  }

  return groups;
}

/** Groups written before types existed have none, and keep the quantity
 *  stepper that was the only behaviour back then. */
export function resolveSelectionType(
  category: Pick<AddOnCategory, "selectionType">,
): AddOnSelectionType {
  const type = category.selectionType;
  return type === "single" || type === "multi" ? type : "add";
}

/**
 * The quantities the sheet opens with: 1 for every option the admin marked as
 * default-selected, nothing for the rest. Options are keyed, not add-ons, so
 * the same add-on defaulted in one group and not in another behaves correctly.
 */
export function defaultAddOnQuantities<P>(
  groups: AddOnGroup<P>[],
): Record<string, number> {
  const quantities: Record<string, number> = {};
  for (const group of groups) {
    // A radio group showing two filled dots would be a lie about what the
    // customer is buying, so only the first default counts there.
    const options =
      group.selectionType === "single"
        ? group.options.filter((o) => o.defaultSelected).slice(0, 1)
        : group.options;
    for (const option of options) {
      if (option.defaultSelected) quantities[option.key] = 1;
    }
  }
  return quantities;
}

/**
 * The required groups the customer has not satisfied yet — a group counts as
 * satisfied once any one of its options is at quantity 1 or more.
 */
export function unmetRequiredGroups<P>(
  groups: AddOnGroup<P>[],
  quantities: Record<string, number>,
): AddOnGroup<P>[] {
  return groups.filter(
    (group) =>
      group.required &&
      !group.options.some((option) => (quantities[option.key] ?? 0) > 0),
  );
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
