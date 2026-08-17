"use client";

import { useState, useEffect } from "react";
import { MenuItem, Category } from "@/lib/types";
import { Select, Drawer } from "antd";
import { useAdminRole } from "@/lib/useAdminRole";
import FoodTypeDot from "@/components/FoodTypeDot";
import FoodTypeRadio from "@/components/FoodTypeRadio";
import AddOnDrawer from "./AddOnDrawer";
import {
  FOOD_TYPE_OPTIONS,
  isVegFoodType,
  resolveFoodType,
  type FoodType,
} from "@/lib/foodType";

type VariantForm = { name: string; price: string };

type FormState = Omit<
  MenuItem,
  | "price"
  | "originalPrice"
  | "kcal"
  | "protein"
  | "rating"
  | "fiber"
  | "carbs"
  | "fat"
  | "variants"
> & {
  price: string;
  originalPrice: string;
  kcal: string;
  protein: string;
  rating: string;
  fiber: string;
  carbs: string;
  fat: string;
  variants: VariantForm[];
};

const initialFormState: FormState = {
  name: "",
  description: "",
  kcal: "",
  protein: "",
  fiber: "",
  carbs: "",
  fat: "",
  price: "",
  originalPrice: "",
  discount: "",
  rating: "",
  reviews: "",
  badge: null,
  ingredients: [],
  image: "",
  foodType: "veg",
  isVeg: true,
  isAddOn: false,
  isRecommended: false,
  showOnHomePage: false,
  isAvailableForSubscription: false,
  hidden: false,
  addOns: [],
  variants: [],
  category: "",
  type: "food",
};

// Rail key for items with no category, or one that has since been deleted.
const UNCATEGORIZED = "__uncategorized";

function parseDiscountPercent(discount: string): number | null {
  const match = discount.trim().match(/(\d+)\s*%?/);
  if (!match) return null;
  const pct = parseInt(match[1], 10);
  return pct >= 0 && pct <= 100 ? pct : null;
}

export default function AdminMenuPage() {
  const role = useAdminRole();
  const isShop = role === "shop";
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [formData, setFormData] = useState<FormState>(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryForm, setCategoryForm] = useState({
    id: "",
    name: "",
    image: "",
    type: "food" as "food" | "beverages",
    hidden: false,
  });
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );

  // Which list is on screen. Categories are admin-only, so the shop role never
  // leaves the Menu tab (the tab bar is hidden for them entirely).
  const [activeTab, setActiveTab] = useState<"menu" | "categories" | "addons">(
    "menu",
  );
  // Both forms live in slide-over drawers now — opened by the "Add …" buttons
  // in each tab header, and by the row-level Edit buttons (prefilled).
  const [itemDrawerOpen, setItemDrawerOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  // Add-ons get their own trimmed form rather than the full menu-item one.
  const [addOnDrawerOpen, setAddOnDrawerOpen] = useState(false);
  const [editingAddOn, setEditingAddOn] = useState<MenuItem | null>(null);

  // Search + filters for the Menu Items list.
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "food" | "beverages">(
    "all",
  );
  // Driven by the left category rail rather than a filter dropdown. Either
  // "all", UNCATEGORIZED, or a Category.id.
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [filterVeg, setFilterVeg] = useState<"all" | FoodType>("all");
  const [filterVisibility, setFilterVisibility] = useState<
    "all" | "visible" | "hidden"
  >("all");
  const [filterTag, setFilterTag] = useState<
    "all" | "recommended" | "subscription" | "homepage"
  >("all");

  useEffect(() => {
    fetchMenuItems();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (!formData.price || !formData.originalPrice)
      return setFormData((prev) => ({ ...prev, discount: "" }));
    const price = Number(formData.price) || 0;
    const originalPrice = Number(formData.originalPrice) || 0;
    const discount =
      originalPrice > price
        ? String(Math.round(((originalPrice - price) / originalPrice) * 100))
        : "0";
    setFormData((prev) => ({ ...prev, discount }));
  }, [formData.price, formData.originalPrice]);

  useEffect(() => {
    const forType = categories.filter((c) => c.type === formData.type);
    const exists = forType.some((c) => c.id === formData.category);
    if (formData.category && !exists) {
      setFormData((prev) => ({ ...prev, category: "" }));
    }
  }, [formData.type]);

  const fetchMenuItems = async () => {
    try {
      const res = await fetch("/api/admin/menu");
      const data = await res.json();
      if (data.success) setMenuItems(data.items);
    } catch (err) {
      console.error("Failed to fetch menu items:", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json();
      if (data.success) setCategories(data.categories ?? []);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
    }
  };

  const toPayload = (): MenuItem => {
    let price = Number(formData.price) || 0;
    const originalPrice = Number(formData.originalPrice) || 0;
    const pct = parseDiscountPercent(formData.discount ?? "");
    if (originalPrice > 0 && pct !== null && price <= 0) {
      price =
        pct > 0 ? Math.round(originalPrice * (1 - pct / 100)) : originalPrice;
    }
    const discount =
      price > 0 && originalPrice > price
        ? String(Math.round(((originalPrice - price) / originalPrice) * 100))
        : price > 0 && originalPrice > 0
          ? "0"
          : (formData.discount ?? "");
    return {
      ...formData,
      addOns: formData.addOns ?? [],
      variants: (formData.variants ?? [])
        .filter((v) => v.name.trim() !== "")
        .map((v) => ({ name: v.name.trim(), price: Number(v.price) || 0 })),
      price,
      originalPrice,
      discount: discount || undefined,
      kcal: Number(formData.kcal) || 0,
      protein: Number(formData.protein) || 0,
      fiber: Number(formData.fiber) || 0,
      carbs: Number(formData.carbs) || 0,
      fat: Number(formData.fat) || 0,
      isVeg: isVegFoodType(formData.foodType ?? "veg"),
      rating: Number(formData.rating) || 0,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = toPayload();
      if (editingId) {
        await fetch("/api/admin/menu", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, _id: editingId }),
        });
      } else {
        await fetch("/api/admin/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setFormData(initialFormState);
      setEditingId(null);
      setItemDrawerOpen(false);
      fetchMenuItems();
    } catch (err) {
      console.error("Failed to save menu item:", err);
    }
    setLoading(false);
  };

  const openAddItem = () => {
    setFormData(initialFormState);
    setEditingId(null);
    setItemDrawerOpen(true);
  };

  const openAddAddOn = () => {
    setEditingAddOn(null);
    setAddOnDrawerOpen(true);
  };

  const openEditAddOn = (item: MenuItem) => {
    setEditingAddOn(item);
    setAddOnDrawerOpen(true);
  };

  const handleEdit = (item: MenuItem) => {
    setFormData({
      ...item,
      description: item.description ?? "",
      ingredients: item.ingredients ?? [],
      addOns: item.addOns ?? [],
      variants: (item.variants ?? []).map((v) => ({
        name: v.name,
        price: String(v.price),
      })),
      price: String(item.price),
      originalPrice: String(item.originalPrice),
      kcal: String(item.kcal),
      protein: String(item.protein),
      fiber: String(item.fiber ?? 0),
      carbs: String(item.carbs ?? 0),
      fat: String(item.fat ?? 0),
      foodType: resolveFoodType(item),
      rating: String(item.rating),
    });
    setEditingId(item._id?.toString() || null);
    setItemDrawerOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    try {
      await fetch(`/api/admin/menu?id=${id}`, { method: "DELETE" });
      fetchMenuItems();
    } catch (err) {
      console.error("Failed to delete menu item:", err);
    }
  };

  const handleCancel = () => {
    setFormData(initialFormState);
    setEditingId(null);
    setItemDrawerOpen(false);
  };

  const addVariant = () =>
    setFormData((prev) => ({
      ...prev,
      variants: [...prev.variants, { name: "", price: "" }],
    }));

  const updateVariant = (
    index: number,
    field: keyof VariantForm,
    value: string,
  ) =>
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, [field]: value } : v,
      ),
    }));

  const removeVariant = (index: number) =>
    setFormData((prev) => ({
      ...prev,
      variants: prev.variants.filter((_, i) => i !== index),
    }));

  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryLoading(true);
    try {
      const method = editingCategoryId ? "PUT" : "POST";
      const payload = editingCategoryId
        ? { ...categoryForm, _id: editingCategoryId }
        : categoryForm;

      await fetch("/api/admin/categories", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      resetCategoryForm();
      fetchCategories();
    } catch (err) {
      console.error("Failed to create category:", err);
    }
    setCategoryLoading(false);
  };

  const resetCategoryForm = () => {
    setCategoryForm({
      id: "",
      name: "",
      image: "",
      type: "food",
      hidden: false,
    });
    setEditingCategoryId(null);
    setCategoryDrawerOpen(false);
  };

  const openAddCategory = () => {
    setCategoryForm({
      id: "",
      name: "",
      image: "",
      type: "food",
      hidden: false,
    });
    setEditingCategoryId(null);
    setCategoryDrawerOpen(true);
  };

  const handleCategoryDelete = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      await fetch(`/api/admin/categories?id=${id}`, { method: "DELETE" });
      fetchCategories();
    } catch (err) {
      console.error("Failed to delete category:", err);
    }
  };

  const handleCategoryEdit = (cat: Category) => {
    setCategoryForm({
      id: cat.id,
      name: cat.name,
      image: cat.image,
      type: cat.type,
      hidden: cat.hidden ?? false,
    });
    setEditingCategoryId(cat._id != null ? String(cat._id) : null);
    setCategoryDrawerOpen(true);
  };

  const toggleMenuItemHidden = async (item: MenuItem) => {
    if (!item._id) return;
    try {
      await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...item,
          hidden: !item.hidden,
          _id: String(item._id),
        }),
      });
      fetchMenuItems();
    } catch (err) {
      console.error("Failed to toggle menu item visibility:", err);
    }
  };

  const toggleCategoryHidden = async (cat: Category) => {
    if (!cat._id) return;
    try {
      await fetch("/api/admin/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cat,
          hidden: !cat.hidden,
          _id: String(cat._id),
        }),
      });
      fetchCategories();
    } catch (err) {
      console.error("Failed to toggle category visibility:", err);
    }
  };

  // An item is uncategorized when it has no category, or points at one that has
  // since been deleted — otherwise those items would be unreachable in the UI.
  const knownCategoryIds = new Set(categories.map((c) => c.id));
  const isUncategorized = (item: MenuItem) =>
    !item.category || !knownCategoryIds.has(item.category);

  // Add-ons live in their own tab. `isAddOn` is the real flag — the storefront
  // keys off it alone (Menu.tsx excludes them from standalone cards) and never
  // looks at category. Uncategorized items are folded in as a safety net so an
  // item can never fall out of both tabs; today every uncategorized item is
  // already an add-on, so the two rules pick out the same set bar none.
  const isAddOnItem = (item: MenuItem) =>
    Boolean(item.isAddOn) || isUncategorized(item);

  const matchesFilters = (item: MenuItem) => {
    const q = search.trim().toLowerCase();
    if (
      q &&
      !`${item.name} ${item.description ?? ""}`.toLowerCase().includes(q)
    )
      return false;
    if (filterType !== "all" && (item.type ?? "food") !== filterType)
      return false;
    if (filterVeg !== "all" && resolveFoodType(item) !== filterVeg) return false;
    if (filterVisibility === "hidden" && !item.hidden) return false;
    if (filterVisibility === "visible" && item.hidden) return false;
    if (filterTag === "recommended" && !item.isRecommended) return false;
    if (filterTag === "subscription" && !item.isAvailableForSubscription)
      return false;
    if (filterTag === "homepage" && !item.showOnHomePage) return false;
    return true;
  };

  const menuPool = menuItems.filter((item) => !isAddOnItem(item));
  const addOnPool = menuItems.filter(isAddOnItem);

  // Everything except the rail's category pick. The rail counts are derived
  // from this, so a category's badge always matches what clicking it shows —
  // no "says 8, opens empty" once another filter is on.
  const itemsBeforeCategory = menuPool.filter(matchesFilters);
  const filteredAddOns = addOnPool.filter(matchesFilters);

  const filteredItems = itemsBeforeCategory.filter((item) => {
    if (selectedCategory === "all") return true;
    if (selectedCategory === UNCATEGORIZED) return isUncategorized(item);
    return item.category === selectedCategory;
  });

  // The rail follows the type dropdown, so picking Food hides beverage
  // categories (matching what the old category dropdown did).
  const railCategories = categories.filter(
    (cat) => filterType === "all" || cat.type === filterType,
  );
  const countByCategory = new Map<string, number>();
  let uncategorizedCount = 0;
  for (const item of itemsBeforeCategory) {
    if (isUncategorized(item)) uncategorizedCount++;
    else
      countByCategory.set(
        item.category,
        (countByCategory.get(item.category) ?? 0) + 1,
      );
  }

  // The rail is navigation, not a filter — "Clear filters" leaves it alone.
  const filtersActive =
    search.trim() !== "" ||
    filterType !== "all" ||
    filterVeg !== "all" ||
    filterVisibility !== "all" ||
    filterTag !== "all";

  const clearFilters = () => {
    setSearch("");
    setFilterType("all");
    setFilterVeg("all");
    setFilterVisibility("all");
    setFilterTag("all");
  };

  // Searching jumps back to All Items so a hit in another category is never
  // hidden behind the rail selection.
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (value.trim() !== "") setSelectedCategory("all");
  };

  const renderItemRow = (
    item: MenuItem,
    edit: (item: MenuItem) => void = handleEdit,
  ) => (
    <div
      key={item._id?.toString() || ""}
      className={`flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 ${
        item.hidden ? "opacity-60" : ""
      }`}
    >
      <img
        src={item.image ? item.image : "/food.png"}
        alt={item.name}
        className="w-16 h-16 object-cover rounded-lg"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FoodTypeDot item={item} size={12} />
          <h3 className="font-medium text-gray-800 truncate">{item.name}</h3>
        </div>
        <p className="text-sm text-gray-500">
          ₹{item.price} • {item.kcal} kcal • {item.protein}g protein
        </p>
        <p className="text-xs text-gray-400">
          {item.category} • {item.type}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggleMenuItemHidden(item)}
          title={item.hidden ? "Show on website" : "Hide from website"}
          className={`p-2 rounded-lg transition-colors ${
            item.hidden
              ? "text-gray-500 hover:bg-gray-100"
              : "text-green-600 hover:bg-green-50"
          }`}
        >
          {item.hidden ? (
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
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
              />
            </svg>
          ) : (
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
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          )}
        </button>
        {!isShop && (
          <>
            <button
              onClick={() => edit(item)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
            <button
              onClick={() => handleDelete(item._id?.toString() || "")}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Tab bar. Categories are admin-only, so the shop role never sees it and
          stays on the menu list below. */}
      {!isShop && (
        <div className="flex items-center gap-1 border-b border-gray-200">
          {(
            [
              { key: "menu", label: `Menu (${menuPool.length})` },
              { key: "categories", label: `Categories (${categories.length})` },
              { key: "addons", label: `Addons (${addOnPool.length})` },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-[#1c1c1c] text-[#1c1c1c]"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {!isShop && (
        <Drawer
          title={editingId ? "Edit Menu Item" : "Add New Menu Item"}
          open={itemDrawerOpen}
          onClose={handleCancel}
          width="min(640px, 100vw)"
          destroyOnHidden
        >
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="e.g., Protein-rich soya & potato patty pan toasted in olive oil with fresh veggies..."
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price (₹)
                </label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original Price (₹)
                </label>
                <input
                  type="number"
                  value={formData.originalPrice}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      originalPrice: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount
                </label>
                <input
                  type="text"
                  value={formData.discount}
                  onChange={(e) =>
                    setFormData({ ...formData, discount: e.target.value })
                  }
                  disabled
                  placeholder="e.g., 20"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kcal
                </label>
                <input
                  type="number"
                  value={formData.kcal}
                  onChange={(e) =>
                    setFormData({ ...formData, kcal: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Protein (g)
                </label>
                <input
                  type="number"
                  value={formData.protein}
                  onChange={(e) =>
                    setFormData({ ...formData, protein: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fiber (g)
                </label>
                <input
                  type="number"
                  value={formData.fiber}
                  onChange={(e) =>
                    setFormData({ ...formData, fiber: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  value={formData.carbs}
                  onChange={(e) =>
                    setFormData({ ...formData, carbs: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fat (g)
                </label>
                <input
                  type="number"
                  value={formData.fat}
                  onChange={(e) =>
                    setFormData({ ...formData, fat: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rating
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.rating}
                  onChange={(e) =>
                    setFormData({ ...formData, rating: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reviews
                </label>
                <input
                  type="text"
                  value={formData.reviews}
                  onChange={(e) =>
                    setFormData({ ...formData, reviews: e.target.value })
                  }
                  placeholder="e.g., 500+"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Badge
                </label>
                <input
                  type="text"
                  value={formData.badge || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      badge: e.target.value || null,
                    })
                  }
                  placeholder="e.g., Highly Ordered"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                >
                  <option value="">Select category</option>
                  {categories
                    .filter((cat) => cat.type === formData.type)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Add-ons
                </label>
                <Select
                  mode="multiple"
                  allowClear
                  value={formData.addOns ?? []}
                  onChange={(selected: string[]) => {
                    setFormData((prev) => ({ ...prev, addOns: selected }));
                  }}
                  placeholder="Select add-ons"
                  className="w-100"
                  options={menuItems
                    .filter((item) => item.isAddOn)
                    .map((item) => ({
                      label: item.name,
                      value: item._id?.toString() || "",
                    }))}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Variants (size / option)
                </label>
                <p className="text-xs text-gray-400 mb-2">
                  Add options like Small / Medium / Large. The variant price
                  replaces the item price when the customer selects it.
                </p>
                <div className="space-y-2">
                  {formData.variants.map((variant, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) =>
                          updateVariant(index, "name", e.target.value)
                        }
                        placeholder="e.g., Large"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                      />
                      <input
                        type="number"
                        value={variant.price}
                        onChange={(e) =>
                          updateVariant(index, "price", e.target.value)
                        }
                        placeholder="Price (₹)"
                        className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => removeVariant(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        aria-label="Remove variant"
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
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addVariant}
                  className="mt-2 text-sm font-medium text-[#1c1c1c] border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  + Add variant
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as "food" | "beverages",
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                >
                  <option value="food">Food</option>
                  <option value="beverages">Beverages</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image URL
                </label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={(e) =>
                    setFormData({ ...formData, image: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                  placeholder="Optional"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ingredients (one per line)
                </label>
                <textarea
                  value={(formData.ingredients ?? []).join("\n")}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      ingredients: e.target.value
                        .split("\n")
                        .filter((line) => line.trim() !== ""),
                    })
                  }
                  placeholder={
                    "Harvest Gold Multigrain buns\nSoya patty\nLettuce"
                  }
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent resize-none"
                />
              </div>
              <div className="col-span-2">
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Veg / Non-veg / Egg
                </span>
                <FoodTypeRadio
                  name="menu-item-food-type"
                  value={formData.foodType ?? "veg"}
                  onChange={(foodType) =>
                    setFormData((prev) => ({ ...prev, foodType }))
                  }
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.isAddOn ?? false}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        isAddOn: !prev.isAddOn,
                      }))
                    }
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1c1c1c] focus:ring-offset-1 ${
                      formData.isAddOn ? "bg-[#1c1c1c]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        formData.isAddOn
                          ? "translate-x-5 ml-0.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Add on
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.isRecommended ?? false}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        isRecommended: !prev.isRecommended,
                      }))
                    }
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1c1c1c] focus:ring-offset-1 ${
                      formData.isRecommended ? "bg-[#1c1c1c]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        formData.isRecommended
                          ? "translate-x-5 ml-0.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Recommended
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.showOnHomePage ?? false}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        showOnHomePage: !prev.showOnHomePage,
                      }))
                    }
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1c1c1c] focus:ring-offset-1 ${
                      formData.showOnHomePage ? "bg-[#1c1c1c]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        formData.showOnHomePage
                          ? "translate-x-5 ml-0.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Show on home page
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.isAvailableForSubscription ?? false}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        isAvailableForSubscription:
                          !prev.isAvailableForSubscription,
                      }))
                    }
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1c1c1c] focus:ring-offset-1 ${
                      formData.isAvailableForSubscription
                        ? "bg-[#1c1c1c]"
                        : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        formData.isAvailableForSubscription
                          ? "translate-x-5 ml-0.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Available for subscription
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.hidden ?? false}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        hidden: !prev.hidden,
                      }))
                    }
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1c1c1c] focus:ring-offset-1 ${
                      formData.hidden ? "bg-[#1c1c1c]" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                        formData.hidden
                          ? "translate-x-5 ml-0.5"
                          : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-sm font-medium text-gray-700">
                    Hidden from website
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#1c1c1c] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : editingId ? "Update Item" : "Add Item"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </Drawer>
      )}

      {(isShop || activeTab === "menu") && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              Menu Items ({filteredItems.length}
              {filtersActive ? ` / ${menuItems.length}` : ""})
            </h2>
            <div className="flex items-center gap-3">
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-medium text-[#f56215] hover:underline"
                >
                  Clear filters
                </button>
              )}
              {!isShop && (
                <button
                  type="button"
                  onClick={openAddItem}
                  className="shrink-0 bg-[#1c1c1c] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#024731] transition-colors"
                >
                  + Add Menu Item
                </button>
              )}
            </div>
          </div>

          <div className="mb-4 space-y-2">
            <div className="relative">
              <svg
                className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
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
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search items by name or description"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterType}
                onChange={(e) =>
                  setFilterType(e.target.value as "all" | "food" | "beverages")
                }
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              >
                <option value="all">All types</option>
                <option value="food">Food</option>
                <option value="beverages">Beverages</option>
              </select>
              <select
                value={filterVeg}
                onChange={(e) =>
                  setFilterVeg(e.target.value as "all" | FoodType)
                }
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              >
                <option value="all">All food types</option>
                {FOOD_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} only
                  </option>
                ))}
              </select>
              <select
                value={filterVisibility}
                onChange={(e) =>
                  setFilterVisibility(
                    e.target.value as "all" | "visible" | "hidden",
                  )
                }
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              >
                <option value="all">All visibility</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </select>
              <select
                value={filterTag}
                onChange={(e) =>
                  setFilterTag(
                    e.target.value as
                      "all" | "recommended" | "subscription" | "homepage",
                  )
                }
                className="text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              >
                <option value="all">All tags</option>
                <option value="recommended">Recommended</option>
                <option value="subscription">Subscription</option>
                <option value="homepage">On home page</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-6 border-t border-gray-100 pt-4">
            {/* Category rail — navigation for the item list on the right. */}
            <nav className="w-full md:w-56 shrink-0 md:border-r md:border-gray-100 md:pr-4 max-h-[1000px] overflow-y-auto">
              <div className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-x-visible">
                {[
                  {
                    key: "all",
                    name: "All Items",
                    count: itemsBeforeCategory.length,
                  },
                  ...railCategories.map((cat) => ({
                    key: cat.id,
                    name: cat.name,
                    count: countByCategory.get(cat.id) ?? 0,
                    hidden: cat.hidden,
                  })),
                  ...(uncategorizedCount > 0
                    ? [
                        {
                          key: UNCATEGORIZED,
                          name: "Uncategorized",
                          count: uncategorizedCount,
                        },
                      ]
                    : []),
                ].map((entry) => {
                  const active = selectedCategory === entry.key;
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setSelectedCategory(entry.key)}
                      aria-current={active ? "true" : undefined}
                      className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-[#1c1c1c] text-white"
                          : "text-gray-700 hover:bg-gray-100"
                      } ${"hidden" in entry && entry.hidden ? "opacity-60" : ""}`}
                    >
                      <span className="truncate">{entry.name}</span>
                      <span
                        className={`shrink-0 text-xs ${
                          active ? "text-gray-300" : "text-gray-400"
                        }`}
                      >
                        {entry.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="flex-1 min-w-0 space-y-3 max-h-[1000px] overflow-y-auto">
              {menuItems.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No menu items yet. Add your first item!
                </p>
              ) : filteredItems.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No items match your search or filters.
                </p>
              ) : (
                filteredItems.map((item) => renderItemRow(item))
              )}
            </div>
          </div>
        </div>
      )}

      {!isShop && activeTab === "addons" && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              Addons ({filteredAddOns.length}
              {filtersActive ? ` / ${addOnPool.length}` : ""})
            </h2>
            <div className="flex items-center gap-3">
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm font-medium text-[#f56215] hover:underline"
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                onClick={openAddAddOn}
                className="shrink-0 bg-[#1c1c1c] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#024731] transition-colors"
              >
                + Add Addon
              </button>
            </div>
          </div>

          <p className="mb-4 text-sm text-gray-500">
            Items flagged as add-ons, plus any item with no category. These are
            offered inside the add-to-cart sheet and never appear as standalone
            menu cards on the website.
          </p>

          <div className="relative mb-4">
            <svg
              className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
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
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search add-ons by name or description"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
            />
          </div>

          <div className="space-y-3 max-h-[1000px] overflow-y-auto">
            {addOnPool.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No add-ons yet.</p>
            ) : filteredAddOns.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No add-ons match your search or filters.
              </p>
            ) : (
              filteredAddOns.map((item) => renderItemRow(item, openEditAddOn))
            )}
          </div>
        </div>
      )}

      {!isShop && addOnDrawerOpen && (
        <AddOnDrawer
          editing={editingAddOn}
          onClose={() => {
            setAddOnDrawerOpen(false);
            setEditingAddOn(null);
          }}
          onSaved={fetchMenuItems}
        />
      )}

      {!isShop && (
        <Drawer
          title={editingCategoryId ? "Edit Category" : "Add Category"}
          open={categoryDrawerOpen}
          onClose={resetCategoryForm}
          width="min(480px, 100vw)"
          destroyOnHidden
        >
          <form
            onSubmit={handleCategorySubmit}
            className="space-y-4"
            autoComplete="off"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ID (slug)
              </label>
              <input
                type="text"
                value={categoryForm.id}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, id: e.target.value })
                }
                placeholder="e.g., burgers"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                type="text"
                value={categoryForm.name}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, name: e.target.value })
                }
                placeholder="e.g., Burgers"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image URL
              </label>
              <input
                type="url"
                value={categoryForm.image}
                onChange={(e) =>
                  setCategoryForm({ ...categoryForm, image: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Type
              </label>
              <select
                value={categoryForm.type}
                onChange={(e) =>
                  setCategoryForm({
                    ...categoryForm,
                    type: e.target.value as "food" | "beverages",
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              >
                <option value="food">Food</option>
                <option value="beverages">Beverages</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={categoryForm.hidden}
                onClick={() =>
                  setCategoryForm((prev) => ({
                    ...prev,
                    hidden: !prev.hidden,
                  }))
                }
                className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#1c1c1c] focus:ring-offset-1 ${
                  categoryForm.hidden ? "bg-[#1c1c1c]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
                    categoryForm.hidden
                      ? "translate-x-5 ml-0.5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-gray-700">
                Hidden from website
              </span>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={categoryLoading}
                className="flex-1 bg-[#1c1c1c] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
              >
                {categoryLoading
                  ? editingCategoryId
                    ? "Saving..."
                    : "Adding..."
                  : editingCategoryId
                    ? "Update Category"
                    : "Add Category"}
              </button>
              <button
                type="button"
                onClick={resetCategoryForm}
                className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </Drawer>
      )}

      {!isShop && activeTab === "categories" && (
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              Categories ({categories.length})
            </h2>
            <button
              type="button"
              onClick={openAddCategory}
              className="shrink-0 bg-[#1c1c1c] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#024731] transition-colors"
            >
              + Add Category
            </button>
          </div>
          <div className="space-y-3">
            {categories.length === 0 ? (
              <p className="text-gray-500 text-center py-6">
                No categories yet.
              </p>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat._id?.toString() ?? cat.id}
                  className={`flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 ${
                    cat.hidden ? "opacity-60" : ""
                  }`}
                >
                  {cat.image ? (
                    <img
                      src={cat.image ? cat.image : "/food.png"}
                      alt={cat.name}
                      className="w-12 h-12 object-cover rounded-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-200" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{cat.name}</p>
                    <p className="text-xs text-gray-500">
                      {cat.id} • {cat.type}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCategoryHidden(cat)}
                      title={
                        cat.hidden ? "Show on website" : "Hide from website"
                      }
                      className={`p-2 rounded-lg transition-colors ${
                        cat.hidden
                          ? "text-gray-500 hover:bg-gray-100"
                          : "text-green-600 hover:bg-green-50"
                      }`}
                    >
                      {cat.hidden ? (
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
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                          />
                        </svg>
                      ) : (
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
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCategoryEdit(cat)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleCategoryDelete(
                          cat._id != null ? String(cat._id) : "",
                        )
                      }
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
