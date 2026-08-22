"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import MenuItem, { MenuItemSkeleton } from "./MenuItem";
import RecommendedItem from "./RecommendedItem";
import CategoryFilter from "./CategoryFilter";
import ShimmerImage from "@/components/ui/ShimmerImage";
import { Product } from "@/context/CartContext";
import {
  AddOnCategory,
  AddOnSelectionType,
  Category,
  MenuVariant,
} from "@/lib/types";
import { buildAddOnGroups, type AddOnGroup } from "@/lib/addOnGroups";
import { resolveFoodType, type FoodType } from "@/lib/foodType";

const defaultCategories = [
  {
    id: "burgers",
    name: "Burgers",
    image:
      "https://www.figma.com/api/mcp/asset/26af8de8-4702-4aa9-9adc-c5351c209fae",
  },
  {
    id: "street-food",
    name: "Street Food",
    image:
      "https://www.figma.com/api/mcp/asset/07dc6f0e-dd3f-4859-a160-c6f4948f36c4",
  },
  {
    id: "south-indian",
    name: "South Indian",
    image:
      "https://www.figma.com/api/mcp/asset/57414b6d-a5ed-4ae6-9256-90e2c98d608c",
  },
  {
    id: "coffee-tea",
    name: "Coffee / Tea",
    image:
      "https://www.figma.com/api/mcp/asset/a54c1df4-b2a3-4f26-b11e-6a89d9861777",
  },
];

type MenuProduct = Product & {
  category?: string;
  type?: string;
  showOnHomePage?: boolean;
  isAddOn?: boolean;
  isRecommended?: boolean;
};

/** Add-on categories as /api/menu serves them: hidden ones already withheld,
 *  `_id` flattened to `id`, already in display order. */
type ApiAddOnCategory = {
  id: string;
  name: string;
  required?: boolean;
  selectionType?: AddOnSelectionType;
  members: {
    addOnId: string;
    price?: number;
    defaultSelected?: boolean;
  }[];
  itemIds?: string[];
  menuCategoryIds?: string[];
};

const RECENT_SEARCHES_KEY = "sochmat:recent-searches";
const MAX_RECENT_SEARCHES = 6;
const MAX_SEARCH_RECOMMENDATIONS = 10;

function mapApiItemToProduct(item: {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  price: number;
  originalPrice: number;
  discount?: string;
  rating?: number;
  reviews?: string;
  badge?: string | null;
  description?: string;
  fiber?: number;
  carbs?: number;
  fat?: number;
  ingredients?: string[];
  image: string;
  foodType?: FoodType;
  isVeg: boolean;
  category?: string;
  type?: string;
  showOnHomePage?: boolean;
  isAvailableForSubscription?: boolean;
  addOns?: string[];
  variants?: MenuVariant[];
  isAddOn?: boolean;
  isRecommended?: boolean;
}): MenuProduct {
  return {
    id: item.id,
    name: item.name,
    kcal: item.kcal,
    protein: item.protein,
    price: item.price,
    originalPrice: item.originalPrice,
    discount: item.discount ?? "",
    rating: item.rating ?? 0,
    reviews: item.reviews ?? "",
    badge: item.badge ?? null,
    description: item.description ?? "",
    fiber: item.fiber ?? 0,
    carbs: item.carbs ?? 0,
    fat: item.fat ?? 0,
    ingredients: item.ingredients ?? [],
    image: item.image,
    foodType: resolveFoodType(item),
    isVeg: item.isVeg,
    category: item.category,
    showOnHomePage: item.showOnHomePage ?? false,
    type: item.type,
    isAvailableForSubscription: item.isAvailableForSubscription ?? false,
    addOns: item.addOns ?? [],
    variants: item.variants ?? [],
    isAddOn: item.isAddOn ?? false,
    isRecommended: item.isRecommended ?? false,
  };
}

interface MenuProps {
  showTitle?: boolean;
  linkCategoriesToMenu?: boolean;
  showOnHomePage?: boolean;
  initialActiveCategory?: string | null;
  hideHeader?: boolean;
}

export default function Menu({
  showTitle = true,
  linkCategoriesToMenu = false,
  showOnHomePage = false,
  initialActiveCategory = null,
  hideHeader = false,
}: MenuProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialActiveCategory
  );
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [addOnCategories, setAddOnCategories] = useState<AddOnCategory[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Focusing the search field takes over the pane: everything else is dropped
  // and the field moves to the top, over recents + recommendations.
  const [searchMode, setSearchMode] = useState(false);
  const [vegOnly, setVegOnly] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      setRecentSearches(
        parsed
          .filter((term): term is string => typeof term === "string")
          .slice(0, MAX_RECENT_SEARCHES)
      );
    } catch {
      // A malformed or unavailable store just means no history to show.
    }
  }, []);

  // Entering search mode remounts the field in the new layout position, so the
  // caret has to be put back explicitly.
  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  // Recording every keystroke would fill the list with prefixes of one word, so
  // a term is only kept once the user acts on it or leaves the search.
  const rememberSearch = useCallback((raw: string) => {
    const term = raw.trim();
    if (term.length < 2) return;
    setRecentSearches((prev) => {
      const next = [
        term,
        ...prev.filter((t) => t.toLowerCase() !== term.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);
      try {
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // Persistence is best-effort; the in-memory list still updates.
      }
      return next;
    });
  }, []);

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch {
      // Ignore — the list is already cleared for this session.
    }
  };

  const exitSearch = () => {
    rememberSearch(search);
    setSearch("");
    setSearchMode(false);
  };

  useEffect(() => {
    let cancelled = false;
    async function fetchMenu() {
      try {
        const res = await fetch("/api/menu");
        const data = await res.json();
        if (cancelled || !data.success) return;
        const items = (data.items ?? []).map(mapApiItemToProduct);
        setProducts(items);
        setAddOnCategories(
          (data.addOnCategories ?? []).map((c: ApiAddOnCategory) => ({
            _id: c.id,
            name: c.name,
            required: c.required,
            selectionType: c.selectionType,
            members: c.members ?? [],
            itemIds: c.itemIds ?? [],
            menuCategoryIds: c.menuCategoryIds ?? [],
          })),
        );
        if (data.categories?.length) {
          const cats = data.categories.map((c: Category) => ({
            id: c.id,
            name: c.name,
            image: c.image ?? defaultCategories[0]?.image ?? "",
            type: c.type,
          }));
          setCategories(cats);
          setActiveCategory(initialActiveCategory ?? cats[0]?.id ?? null);
        }
      } catch {
        if (!cancelled) setError("Failed to load menu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchMenu();
    return () => {
      cancelled = true;
    };
  }, []);

  // Add-ons are stored as ID references to other menu items: the item's own
  // picks, plus the members of every add-on category offered on it. The
  // categories own that mapping, so which ones apply is decided by scanning
  // them rather than by reading a field off the item.
  const addOnsById = new Map(products.map((p) => [p.id, p]));
  const resolveAddOnGroups = (product: MenuProduct): AddOnGroup<Product>[] =>
    buildAddOnGroups<MenuProduct>({
      itemId: product.id,
      menuCategoryId: product.category,
      addOnIds: product.addOns,
      productsById: addOnsById,
      categories: addOnCategories,
    });

  // While searching, match by name/description across the whole menu and ignore
  // the selected category; otherwise filter by the chosen category.
  const query = search.trim().toLowerCase();
  const listProducts = products.filter((p) => {
    // Add-on items are only offered inside the add-to-cart sheet, never as
    // standalone menu cards.
    if (p.isAddOn) return false;
    if (vegOnly && !p.isVeg) return false;
    if (query) {
      return `${p.name} ${p.description ?? ""}`.toLowerCase().includes(query);
    }
    return (
      activeCategory === "all" || !p.category || p.category === activeCategory
    );
  });

  const displayProducts = listProducts;

  const orderable = products.filter((p) => !p.isAddOn);

  // Recent terms are plain strings, so a thumbnail is borrowed from whichever
  // dish the term still matches; older terms may no longer match anything.
  const thumbnailForTerm = (term: string) => {
    const t = term.trim().toLowerCase();
    if (!t) return null;
    const match = orderable.find((p) => p.name.toLowerCase().includes(t));
    return match?.image ?? null;
  };

  const curated = orderable.filter((p) => p.isRecommended);
  const searchRecommendations = (curated.length ? curated : orderable).slice(
    0,
    MAX_SEARCH_RECOMMENDATIONS
  );

  const searchField = (
    <div className="flex items-center gap-2 px-3 bg-white border border-[#d9d9d9] rounded-[12px]">
      {searchMode ? (
        <button
          type="button"
          onClick={exitSearch}
          aria-label="Close search"
          className="shrink-0 -ml-1 p-1 text-[#333]"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      ) : (
        <svg
          className="w-5 h-5 shrink-0 text-[#9a9a9a]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
          />
        </svg>
      )}
      <input
        ref={searchInputRef}
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => setSearchMode(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            rememberSearch(search);
            searchInputRef.current?.blur();
          } else if (e.key === "Escape") {
            exitSearch();
          }
        }}
        placeholder="Search for dishes"
        className="flex-1 min-w-0 py-2 bg-transparent text-[#111] placeholder:text-[#9a9a9a] focus:outline-none"
      />
      {search && (
        <button
          type="button"
          onClick={() => {
            setSearch("");
            searchInputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="shrink-0 text-[#9a9a9a] hover:text-[#555] transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );

  const searchRow = (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0">{searchField}</div>
      <button
        type="button"
        role="switch"
        aria-checked={vegOnly}
        aria-label="Veg only"
        onClick={() => setVegOnly((prev) => !prev)}
        className={`relative shrink-0 w-[64px] h-[26px] rounded-full transition-colors ${
          vegOnly ? "bg-green-600" : "bg-[#d9d9d9]"
        }`}
      >
        {/* Label sits opposite the knob, so it swaps sides when toggled. */}
        <span
          className={`absolute inset-0 flex items-center text-[11px] font-semibold ${
            vegOnly
              ? "justify-start pl-[12px] text-white"
              : "justify-end pr-[12px] text-[#666]"
          }`}
        >
          Veg
        </span>
        <span
          className={`absolute top-[3px] left-[3px] w-[20px] h-[20px] bg-white rounded-full shadow-sm transition-transform ${
            vegOnly ? "translate-x-[38px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );

  const productList = (
    // Cards carry their own vertical padding so each divider sits centred in
    // the space between two of them.
    <div className="py-0 flex flex-col divide-y divide-[#e6e6e6]">
      {loading ? (
        // Six cards is about a phone screenful — enough that the list reads as
        // populated, not so many that the scrollbar promises a longer menu
        // than may actually arrive.
        Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="shrink-0 py-[22px]">
            <MenuItemSkeleton />
          </div>
        ))
      ) : error ? (
        <p className="text-center text-red-500 py-8">{error}</p>
      ) : (
        (() => {
          const visible = displayProducts.filter((product) =>
            showOnHomePage ? product.showOnHomePage : true
          );
          if (visible.length === 0) {
            return (
              <p className="text-center text-gray-500 py-8">
                {query
                  ? `No dishes found for "${search.trim()}"`
                  : "No items available"}
              </p>
            );
          }
          return visible.map((product) => (
            <div key={product.id} className="shrink-0 py-[22px]">
              <MenuItem
                product={product}
                addOnGroups={resolveAddOnGroups(product)}
              />
            </div>
          ));
        })()
      )}
    </div>
  );

  if (searchMode) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col">
          <div className="sticky top-0 z-10 bg-white pt-1 pb-2">
            {searchRow}
          </div>

          {query ? (
            productList
          ) : (
            <div className="flex flex-col gap-7 py-5">
              {recentSearches.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[#111] text-base font-semibold">
                      Recent searches
                    </h3>
                    <button
                      type="button"
                      onClick={clearRecentSearches}
                      className="text-[#f56215] text-sm font-medium"
                    >
                      clear
                    </button>
                  </div>
                  <div className="flex flex-col items-start gap-2">
                    {recentSearches.map((term) => {
                      const thumbnail = thumbnailForTerm(term);
                      return (
                        <button
                          key={term}
                          type="button"
                          onClick={() => {
                            setSearch(term);
                            rememberSearch(term);
                          }}
                          className="max-w-full flex items-center gap-3 pl-2 pr-4 py-2 bg-white border border-[#d9d9d9] rounded-[16px] text-left"
                        >
                          {thumbnail ? (
                            <ShimmerImage
                              src={thumbnail}
                              alt=""
                              width={32}
                              height={32}
                              className="w-8 h-8 shrink-0 rounded-[8px] object-cover"
                              wrapperClassName="w-8 h-8 shrink-0 rounded-[8px] overflow-hidden"
                              unoptimized
                            />
                          ) : (
                            <span className="w-8 h-8 shrink-0 rounded-[8px] bg-[#f0f0f0] flex items-center justify-center">
                              <svg
                                className="w-4 h-4 text-[#9a9a9a]"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                                />
                              </svg>
                            </span>
                          )}
                          <span className="text-[#111] text-sm font-medium truncate">
                            {term}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {searchRecommendations.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-[#111] text-base font-semibold">
                    Recommended for you
                  </h3>
                  <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                    {searchRecommendations.map((product) => (
                      <RecommendedItem key={product.id} product={product} />
                    ))}
                  </div>
                </div>
              )}

              {recentSearches.length === 0 &&
                searchRecommendations.length === 0 && (
                  <p className="text-center text-gray-500 py-8">
                    Start typing to find a dish.
                  </p>
                )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide flex flex-col">
        {!hideHeader && showTitle && (
          <div className="text-center mb-6">
            <h2 className="font-squada text-[48px] text-[#1c1c1c] uppercase tracking-tight">
              Menu
            </h2>
            <p className="font-satisfy text-[#f56215] text-2xl -rotate-2">
              Healthy Meals
            </p>
          </div>
        )}

        {!hideHeader && (
          <div className="sticky top-0 z-10 bg-white">
            {searchRow}

            {!query && (
              <CategoryFilter
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
              />
            )}
          </div>
        )}

        {productList}
      </div>
    </div>
  );
}
