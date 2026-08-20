import { describe, it, expect } from "vitest";
import {
  addOnCategoryAppliesTo,
  buildAddOnGroups,
  cheapestAddOnPrice,
  resolveMemberPrice,
  sortAddOnCategories,
  splitCheckedMapping,
  DIRECT_GROUP_TITLE,
} from "@/lib/addOnGroups";
import type { AddOnCategory } from "@/lib/types";

type TestProduct = { id: string; price: number; name: string };

const mayo = { id: "mayo", price: 15, name: "Mayo" };
const peri = { id: "peri", price: 15, name: "Peri Peri" };
const cheese = { id: "cheese", price: 30, name: "Extra Cheese" };

const productsById = new Map<string, TestProduct>([
  ["mayo", mayo],
  ["peri", peri],
  ["cheese", cheese],
]);

// The item under test: a burger, offered directly by some groups and through
// its menu category by others.
const BURGER = "burger-1";
const BURGERS = "burgers";

const sauces: AddOnCategory = {
  _id: "sauces",
  name: "Sauces",
  members: [{ addOnId: "mayo", price: 10 }, { addOnId: "peri" }],
  menuCategoryIds: [BURGERS],
};
const freeExtras: AddOnCategory = {
  _id: "free",
  name: "Free Extras",
  members: [{ addOnId: "mayo", price: 0 }],
  itemIds: [BURGER],
};

function build(
  categories: AddOnCategory[],
  overrides: Partial<Parameters<typeof buildAddOnGroups<TestProduct>>[0]> = {},
) {
  return buildAddOnGroups<TestProduct>({
    itemId: BURGER,
    menuCategoryId: BURGERS,
    productsById,
    categories,
    ...overrides,
  });
}

describe("addOnCategoryAppliesTo", () => {
  it("offers a group on an item it names directly", () => {
    expect(addOnCategoryAppliesTo(freeExtras, BURGER, "anything")).toBe(true);
  });

  it("offers a group on every item in a menu category it names", () => {
    expect(addOnCategoryAppliesTo(sauces, "some-other-item", BURGERS)).toBe(
      true,
    );
  });

  it("passes over items it reaches neither way", () => {
    expect(addOnCategoryAppliesTo(sauces, BURGER, "beverages")).toBe(false);
    expect(addOnCategoryAppliesTo(freeExtras, "other", "beverages")).toBe(false);
  });

  it("does not treat an uncategorized item as a match for a blank id", () => {
    const blank: AddOnCategory = {
      _id: "blank",
      name: "Blank",
      members: [],
      menuCategoryIds: [""],
    };
    expect(addOnCategoryAppliesTo(blank, "item", undefined)).toBe(false);
  });
});

describe("buildAddOnGroups", () => {
  it("keeps the item's own picks in their own group, at their own price", () => {
    const groups = build([], { addOnIds: ["cheese"] });

    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe(DIRECT_GROUP_TITLE);
    expect(groups[0].options[0].product).toBe(cheese);
    expect(groups[0].options[0].price).toBe(30);
  });

  it("renders direct picks first, then the groups in the order given", () => {
    const groups = build([freeExtras, sauces], { addOnIds: ["cheese"] });

    expect(groups.map((g) => g.title)).toEqual([
      DIRECT_GROUP_TITLE,
      "Free Extras",
      "Sauces",
    ]);
    // Within a category, the member list is the order.
    expect(groups[2].options.map((o) => o.product.id)).toEqual([
      "mayo",
      "peri",
    ]);
  });

  it("leaves out groups that are not offered on this item", () => {
    const elsewhere: AddOnCategory = {
      _id: "elsewhere",
      name: "Elsewhere",
      members: [{ addOnId: "cheese" }],
      menuCategoryIds: ["beverages"],
      itemIds: ["some-other-item"],
    };
    expect(build([elsewhere])).toEqual([]);
  });

  it("charges the category's override, falling back to the add-on's price", () => {
    const [group] = build([sauces]);

    expect(group.options.map((o) => [o.product.id, o.price])).toEqual([
      ["mayo", 10],
      ["peri", 15],
    ]);
  });

  it("offers the same add-on once per group when the prices differ", () => {
    // The point of the feature: ₹10 Mayo under Sauces and free Mayo under Free
    // Extras are two different offers, and the sheet has to keep them apart.
    const groups = build([sauces, freeExtras]);

    const mayoOptions = groups.flatMap((g) =>
      g.options.filter((o) => o.product.id === "mayo"),
    );
    expect(mayoOptions.map((o) => o.price)).toEqual([10, 0]);
    // Distinct keys, or the sheet's quantity state would count them as one.
    expect(new Set(mayoOptions.map((o) => o.key)).size).toBe(2);
  });

  it("drops add-ons it cannot resolve, so hidden and deleted ones vanish", () => {
    const groups = build([sauces], {
      addOnIds: ["cheese", "gone"],
      productsById: new Map([["cheese", cheese]]),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].options.map((o) => o.product.id)).toEqual(["cheese"]);
  });

  it("leaves out hidden and empty groups rather than showing a bare heading", () => {
    const groups = build([
      {
        _id: "hidden",
        name: "Hidden",
        hidden: true,
        members: [{ addOnId: "mayo" }],
        itemIds: [BURGER],
      },
      { _id: "empty", name: "Empty", members: [], itemIds: [BURGER] },
    ]);

    expect(groups).toEqual([]);
  });

  it("ignores a repeat of the same add-on inside one group", () => {
    // Two identical rows in one group would be indistinguishable on screen.
    const [group] = build([
      {
        _id: "dupes",
        name: "Dupes",
        members: [{ addOnId: "mayo", price: 10 }, { addOnId: "mayo", price: 5 }],
        itemIds: [BURGER],
      },
    ]);

    expect(group.options).toHaveLength(1);
    expect(group.options[0].price).toBe(10);
  });

  it("offers a group once when it reaches the item both ways", () => {
    const both: AddOnCategory = {
      ...sauces,
      itemIds: [BURGER],
      menuCategoryIds: [BURGERS],
    };
    expect(build([both])).toHaveLength(1);
  });
});

describe("sortAddOnCategories", () => {
  it("puts low sortOrder first", () => {
    const sorted = sortAddOnCategories([
      { _id: "b", name: "B", members: [], sortOrder: 2 },
      { _id: "a", name: "A", members: [], sortOrder: 0 },
      { _id: "c", name: "C", members: [], sortOrder: 1 },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["A", "C", "B"]);
  });

  it("sorts documents written before ordering existed to the end", () => {
    const sorted = sortAddOnCategories([
      { _id: "old", name: "Old", members: [] },
      { _id: "new", name: "New", members: [], sortOrder: 5 },
    ]);
    expect(sorted.map((c) => c.name)).toEqual(["New", "Old"]);
  });

  it("leaves the input array alone", () => {
    const input: AddOnCategory[] = [
      { _id: "b", name: "B", members: [], sortOrder: 1 },
      { _id: "a", name: "A", members: [], sortOrder: 0 },
    ];
    sortAddOnCategories(input);
    expect(input.map((c) => c.name)).toEqual(["B", "A"]);
  });
});

describe("splitCheckedMapping", () => {
  // Which menu category each item sits in, as the admin tree knows it.
  const menuCategoryOf = (itemId: string) =>
    ({ "burger-1": "burgers", "burger-2": "burgers", coffee: "drinks" })[
      itemId
    ];

  it("stores a fully ticked category as the category, dropping its items", () => {
    // The whole point of ticking the parent: burgers added later inherit it.
    expect(
      splitCheckedMapping(
        {
          menuCategoryIds: ["burgers"],
          itemIds: ["burger-1", "burger-2"],
        },
        menuCategoryOf,
      ),
    ).toEqual({ menuCategoryIds: ["burgers"], itemIds: [] });
  });

  it("stores a half-ticked category as just the items ticked", () => {
    expect(
      splitCheckedMapping(
        { menuCategoryIds: [], itemIds: ["burger-1"] },
        menuCategoryOf,
      ),
    ).toEqual({ menuCategoryIds: [], itemIds: ["burger-1"] });
  });

  it("keeps items from other categories when one category is fully ticked", () => {
    expect(
      splitCheckedMapping(
        {
          menuCategoryIds: ["burgers"],
          itemIds: ["burger-1", "burger-2", "coffee"],
        },
        menuCategoryOf,
      ),
    ).toEqual({ menuCategoryIds: ["burgers"], itemIds: ["coffee"] });
  });

  it("keeps an item whose category it cannot place", () => {
    expect(
      splitCheckedMapping(
        { menuCategoryIds: ["burgers"], itemIds: ["mystery"] },
        menuCategoryOf,
      ),
    ).toEqual({ menuCategoryIds: ["burgers"], itemIds: ["mystery"] });
  });

  it("ticks nothing into nothing", () => {
    expect(
      splitCheckedMapping({ menuCategoryIds: [], itemIds: [] }, menuCategoryOf),
    ).toEqual({ menuCategoryIds: [], itemIds: [] });
  });
});

describe("resolveMemberPrice", () => {
  it("treats a zero override as a real free-of-charge price", () => {
    expect(resolveMemberPrice(0, 15)).toBe(0);
  });

  it("falls back to the add-on's own price when there is no override", () => {
    expect(resolveMemberPrice(undefined, 15)).toBe(15);
    expect(resolveMemberPrice(null, 15)).toBe(15);
    expect(resolveMemberPrice(Number.NaN, 15)).toBe(15);
  });

  it("never lets a negative price pay the customer", () => {
    expect(resolveMemberPrice(-5, 15)).toBe(0);
  });
});

describe("cheapestAddOnPrice", () => {
  it("keeps the add-on's own price when nothing undercuts it", () => {
    expect(cheapestAddOnPrice("peri", 15, [sauces, freeExtras])).toBe(15);
  });

  it("takes the lowest category override, so a free extra is not rejected", () => {
    // The order API's anti-tampering floor: charging ₹0 for Mayo is legitimate
    // when a category says so, and must not read as an underpayment.
    expect(cheapestAddOnPrice("mayo", 15, [sauces, freeExtras])).toBe(0);
  });

  it("ignores overrides that cost more than the add-on's own price", () => {
    const pricey: AddOnCategory = {
      _id: "pricey",
      name: "Pricey",
      members: [{ addOnId: "cheese", price: 50 }],
    };
    expect(cheapestAddOnPrice("cheese", 30, [pricey])).toBe(30);
  });

  it("is unaffected by categories the add-on is not in", () => {
    expect(cheapestAddOnPrice("cheese", 30, [sauces, freeExtras])).toBe(30);
  });
});
