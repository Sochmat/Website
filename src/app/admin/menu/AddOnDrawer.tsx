"use client";

import { useState } from "react";
import { Drawer } from "antd";
import type { MenuItem } from "@/lib/types";
import FoodTypeRadio from "@/components/FoodTypeRadio";
import {
  isVegFoodType,
  resolveFoodType,
  type FoodType,
} from "@/lib/foodType";

/**
 * Add-ons are `menuItems` documents like any other, but they're never shown as
 * standalone cards — only inside the add-to-cart sheet. So the admin only fills
 * the handful of fields that actually matter for them: name, description,
 * image, price, nutrient content, badge and the veg marker. Everything else
 * (category, variants, nested add-ons, the visibility toggles) is left off the
 * form and defaulted on create; on edit we PATCH only these fields, so anything
 * set elsewhere on the document survives.
 */

type AddOnForm = {
  name: string;
  description: string;
  image: string;
  price: string;
  originalPrice: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  badge: string;
  foodType: FoodType;
};

const EMPTY_FORM: AddOnForm = {
  name: "",
  description: "",
  image: "",
  price: "",
  originalPrice: "",
  kcal: "",
  protein: "",
  carbs: "",
  fat: "",
  fiber: "",
  badge: "",
  foodType: "veg",
};

const NUTRIENTS: { key: keyof AddOnForm; label: string }[] = [
  { key: "kcal", label: "Calories (kcal)" },
  { key: "protein", label: "Protein (g)" },
  { key: "carbs", label: "Carbs (g)" },
  { key: "fat", label: "Fat (g)" },
  { key: "fiber", label: "Fiber (g)" },
];

const inputClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent";

function formFor(editing: MenuItem | null): AddOnForm {
  if (!editing) return EMPTY_FORM;
  return {
    name: editing.name ?? "",
    description: editing.description ?? "",
    image: editing.image ?? "",
    price: String(editing.price ?? ""),
    originalPrice: String(editing.originalPrice ?? editing.price ?? ""),
    kcal: String(editing.kcal ?? 0),
    protein: String(editing.protein ?? 0),
    carbs: String(editing.carbs ?? 0),
    fat: String(editing.fat ?? 0),
    fiber: String(editing.fiber ?? 0),
    badge: editing.badge ?? "",
    foodType: resolveFoodType(editing),
  };
}

interface AddOnDrawerProps {
  /** The add-on being edited, or null when creating a new one. */
  editing: MenuItem | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Mounted only while open, so the form starts from `editing` every time. */
export default function AddOnDrawer({
  editing,
  onClose,
  onSaved,
}: AddOnDrawerProps) {
  const [form, setForm] = useState<AddOnForm>(() => formFor(editing));
  // Original price mirrors price until the admin types their own, which is the
  // common case: an add-on with no strike-through offer.
  const [originalPriceTouched, setOriginalPriceTouched] = useState(
    editing !== null,
  );
  const [saving, setSaving] = useState(false);

  const setField = (key: keyof AddOnForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handlePriceChange = (value: string) =>
    setForm((prev) => ({
      ...prev,
      price: value,
      originalPrice: originalPriceTouched ? prev.originalPrice : value,
    }));

  const handleOriginalPriceChange = (value: string) => {
    setOriginalPriceTouched(true);
    setField("originalPrice", value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const price = Number(form.price) || 0;
      const originalPrice = Number(form.originalPrice) || price;
      const fields = {
        name: form.name.trim(),
        description: form.description,
        image: form.image,
        price,
        originalPrice,
        discount:
          originalPrice > price
            ? String(Math.round(((originalPrice - price) / originalPrice) * 100))
            : "0",
        kcal: Number(form.kcal) || 0,
        protein: Number(form.protein) || 0,
        carbs: Number(form.carbs) || 0,
        fat: Number(form.fat) || 0,
        fiber: Number(form.fiber) || 0,
        badge: form.badge.trim() || null,
        foodType: form.foodType,
        isVeg: isVegFoodType(form.foodType),
        isAddOn: true,
      };

      if (editing?._id) {
        await fetch("/api/admin/menu", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...fields, _id: editing._id.toString() }),
        });
      } else {
        await fetch("/api/admin/menu", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...fields,
            // Defaults for the fields this form deliberately doesn't ask for.
            category: "",
            type: "food",
            rating: 0,
            reviews: "",
            ingredients: [],
            addOns: [],
            variants: [],
            hidden: false,
            isRecommended: false,
            showOnHomePage: false,
            isAvailableForSubscription: false,
          }),
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      console.error("Failed to save add-on:", err);
    }
    setSaving(false);
  };

  return (
    <Drawer
      title={editing ? "Edit Addon" : "Add New Addon"}
      open
      onClose={onClose}
      width="min(520px, 100vw)"
      destroyOnHidden
    >
      <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            className={inputClass}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="e.g., Extra cheese slice, melted over the patty"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Image URL
          </label>
          <input
            type="url"
            value={form.image}
            onChange={(e) => setField("image", e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Price (₹)
            </label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => handlePriceChange(e.target.value)}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Original Price (₹)
            </label>
            <input
              type="number"
              value={form.originalPrice}
              onChange={(e) => handleOriginalPriceChange(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-400">
              Defaults to the price. Set it higher to show a discount.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Nutrient content
          </label>
          <div className="grid grid-cols-2 gap-3">
            {NUTRIENTS.map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1">
                  {label}
                </label>
                <input
                  type="number"
                  value={form[key] as string}
                  onChange={(e) => setField(key, e.target.value)}
                  className={inputClass}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Badge
          </label>
          <input
            type="text"
            value={form.badge}
            onChange={(e) => setField("badge", e.target.value)}
            placeholder="e.g., High Protein"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-gray-400">
            Comma-separate for multiple badges.
          </p>
        </div>

        <div>
          <span className="block text-sm font-medium text-gray-700 mb-2">
            Veg / Non-veg / Egg
          </span>
          <FoodTypeRadio
            name="addon-food-type"
            value={form.foodType}
            onChange={(foodType) => setForm((prev) => ({ ...prev, foodType }))}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-[#1c1c1c] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : editing ? "Update Addon" : "Add Addon"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Drawer>
  );
}
