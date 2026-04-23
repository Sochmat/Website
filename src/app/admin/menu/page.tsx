"use client";

import { useState, useEffect } from "react";
import { MenuItem, Category } from "@/lib/types";
import { Select } from "antd";

type FormState = Omit<
  MenuItem,
  "price" | "originalPrice" | "kcal" | "protein" | "rating" | "fiber" | "carbs"
> & {
  price: string;
  originalPrice: string;
  kcal: string;
  protein: string;
  rating: string;
  fiber: string;
  carbs: string;
};

const initialFormState: FormState = {
  name: "",
  description: "",
  kcal: "",
  protein: "",
  fiber: "",
  carbs: "",
  price: "",
  originalPrice: "",
  discount: "",
  rating: "",
  reviews: "",
  badge: null,
  ingredients: [],
  image: "",
  isVeg: true,
  isAddOn: false,
  isRecommended: false,
  showOnHomePage: false,
  isAvailableForSubscription: false,
  hidden: false,
  addOns: [],
  category: "",
  type: "food",
};

function parseDiscountPercent(discount: string): number | null {
  const match = discount.trim().match(/(\d+)\s*%?/);
  if (!match) return null;
  const pct = parseInt(match[1], 10);
  return pct >= 0 && pct <= 100 ? pct : null;
}

export default function AdminMenuPage() {
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
      price,
      originalPrice,
      discount: discount || undefined,
      kcal: Number(formData.kcal) || 0,
      protein: Number(formData.protein) || 0,
      fiber: Number(formData.fiber) || 0,
      carbs: Number(formData.carbs) || 0,
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
      fetchMenuItems();
    } catch (err) {
      console.error("Failed to save menu item:", err);
    }
    setLoading(false);
  };

  const handleEdit = (item: MenuItem) => {
    setFormData({
      ...item,
      description: item.description ?? "",
      ingredients: item.ingredients ?? [],
      addOns: item.addOns ?? [],
      price: String(item.price),
      originalPrice: String(item.originalPrice),
      kcal: String(item.kcal),
      protein: String(item.protein),
      fiber: String(item.fiber ?? 0),
      carbs: String(item.carbs ?? 0),
      rating: String(item.rating),
    });
    setEditingId(item._id?.toString() || null);
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
  };

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
      setCategoryForm({
        id: "",
        name: "",
        image: "",
        type: "food",
        hidden: false,
      });
      setEditingCategoryId(null);
      fetchCategories();
    } catch (err) {
      console.error("Failed to create category:", err);
    }
    setCategoryLoading(false);
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
  };

  const toggleMenuItemHidden = async (item: MenuItem) => {
    if (!item._id) return;
    try {
      await fetch("/api/admin/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...item, hidden: !item.hidden, _id: String(item._id) }),
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
        body: JSON.stringify({ ...cat, hidden: !cat.hidden, _id: String(cat._id) }),
      });
      fetchCategories();
    } catch (err) {
      console.error("Failed to toggle category visibility:", err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {editingId ? "Edit Menu Item" : "Add New Menu Item"}
          </h2>
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
                    setFormData({ ...formData, originalPrice: e.target.value })
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
                    setFormData({ ...formData, badge: e.target.value || null })
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isVeg}
                    onChange={(e) =>
                      setFormData({ ...formData, isVeg: e.target.checked })
                    }
                    className="w-4 h-4 text-[#1c1c1c] rounded focus:ring-[#1c1c1c]"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Vegetarian
                  </span>
                </label>
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
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Menu Items ({menuItems.length})
          </h2>
          <div className="space-y-3 max-h-[800px] overflow-y-auto">
            {menuItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No menu items yet. Add your first item!
              </p>
            ) : (
              menuItems.map((item) => (
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
                      <div
                        className={`w-3 h-3 border-2 ${
                          item.isVeg ? "border-green-600" : "border-red-600"
                        } flex items-center justify-center`}
                      >
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            item.isVeg ? "bg-green-600" : "bg-red-600"
                          }`}
                        />
                      </div>
                      <h3 className="font-medium text-gray-800 truncate">
                        {item.name}
                      </h3>
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
                    <button
                      onClick={() => handleEdit(item)}
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
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {editingCategoryId ? "Edit Category" : "Add Category"}
          </h2>
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
                  setCategoryForm((prev) => ({ ...prev, hidden: !prev.hidden }))
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
              {editingCategoryId && (
                <button
                  type="button"
                  onClick={() => {
                    setCategoryForm({
                      id: "",
                      name: "",
                      image: "",
                      type: "food",
                      hidden: false,
                    });
                    setEditingCategoryId(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Categories ({categories.length})
          </h2>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
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
                      title={cat.hidden ? "Show on website" : "Hide from website"}
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
      </div>
    </div>
  );
}
