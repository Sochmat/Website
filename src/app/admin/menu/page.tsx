"use client";

import { useState, useEffect } from "react";
import { MenuItem, Category } from "@/lib/types";

type FormState = Omit<
  MenuItem,
  "price" | "originalPrice" | "kcal" | "protein" | "rating"
> & {
  price: string;
  originalPrice: string;
  kcal: string;
  protein: string;
  rating: string;
};

const initialFormState: FormState = {
  name: "",
  kcal: "",
  protein: "",
  price: "",
  originalPrice: "",
  discount: "",
  rating: "",
  reviews: "",
  badge: null,
  image: "",
  isVeg: true,
  isAddOn: false,
  isRecommended: false,
  showOnHomePage: false,
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
  });
  const [categoryLoading, setCategoryLoading] = useState(false);

  useEffect(() => {
    fetchMenuItems();
    fetchCategories();
  }, []);

  useEffect(() => {
    const price = Number(formData.price);
    const originalPrice = Number(formData.originalPrice);
    if (price > 0 && originalPrice > 0) {
      const discount =
        originalPrice > price
          ? String(Math.round(((originalPrice - price) / originalPrice) * 100))
          : "0";
      setFormData((prev) => ({ ...prev, discount }));
    }
  }, [formData.price, formData.originalPrice]);

  useEffect(() => {
    const originalPrice = Number(formData.originalPrice);
    const pct = parseDiscountPercent(formData.discount ?? "");
    if (originalPrice > 0 && pct !== null) {
      const price =
        pct > 0 ? Math.round(originalPrice * (1 - pct / 100)) : originalPrice;
      setFormData((prev) => ({ ...prev, price: String(price) }));
    }
  }, [formData.originalPrice, formData.discount]);

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
      price,
      originalPrice,
      discount: discount || undefined,
      kcal: Number(formData.kcal) || 0,
      protein: Number(formData.protein) || 0,
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
      price: String(item.price),
      originalPrice: String(item.originalPrice),
      kcal: String(item.kcal),
      protein: String(item.protein),
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
      await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(categoryForm),
      });
      setCategoryForm({ id: "", name: "", image: "", type: "food" });
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  required
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  placeholder="e.g., 20"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  required
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  required
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  placeholder="Optional"
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
                    className="w-4 h-4 text-[#02583f] rounded focus:ring-[#02583f]"
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
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#02583f] focus:ring-offset-1 ${
                      formData.isAddOn ? "bg-[#02583f]" : "bg-gray-300"
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
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#02583f] focus:ring-offset-1 ${
                      formData.isRecommended ? "bg-[#02583f]" : "bg-gray-300"
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
                    className={`relative inline-flex h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#02583f] focus:ring-offset-1 ${
                      formData.showOnHomePage ? "bg-[#02583f]" : "bg-gray-300"
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
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#02583f] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
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
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {menuItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No menu items yet. Add your first item!
              </p>
            ) : (
              menuItems.map((item) => (
                <div
                  key={item._id?.toString() || ""}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <img
                    src={item.image}
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
          <h2 className="text-lg font-bold text-gray-800 mb-4">Add Category</h2>
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
              >
                <option value="food">Food</option>
                <option value="beverages">Beverages</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={categoryLoading}
              className="w-full bg-[#02583f] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
            >
              {categoryLoading ? "Adding..." : "Add Category"}
            </button>
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
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {cat.image ? (
                    <img
                      src={cat.image}
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
