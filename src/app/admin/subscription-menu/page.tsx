"use client";

import { useEffect, useMemo, useState } from "react";
import { message, Select } from "antd";
import { BRACKET_KEYS, type ProteinBracketKey, type SubscriptionMenuItem } from "@/lib/types";

type NumericField = "protein" | "kcal" | "fiber" | "carbs" | "referencePrice" | "sortOrder";

type FormState = Omit<SubscriptionMenuItem, NumericField | "_id" | "nameKey" | "importKey" | "source" | "createdAt" | "updatedAt"> &
  Record<NumericField, string>;

const initialForm: FormState = {
  name: "",
  bracket: "25-30",
  description: "",
  image: "",
  isVeg: true,
  hidden: false,
  ingredients: [],
  protein: "",
  kcal: "",
  fiber: "",
  carbs: "",
  referencePrice: "",
  sortOrder: "",
};

const BRACKET_OPTIONS = BRACKET_KEYS.map((k) => ({ value: k, label: `${k}g` }));

export default function AdminSubscriptionMenuPage() {
  const [items, setItems] = useState<SubscriptionMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [bracketFilter, setBracketFilter] = useState<"all" | ProteinBracketKey>("all");
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(true);

  const load = () => {
    fetch("/api/admin/subscription-menu")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success) setItems(d.items as SubscriptionMenuItem[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(
    () =>
      items.filter((i) => {
        if (bracketFilter !== "all" && i.bracket !== bracketFilter) return false;
        if (!showHidden && i.hidden) return false;
        if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [items, bracketFilter, showHidden, search],
  );

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const startEdit = (item: SubscriptionMenuItem) => {
    setEditingId(String(item._id));
    setForm({
      name: item.name,
      bracket: item.bracket,
      description: item.description ?? "",
      image: item.image ?? "",
      isVeg: item.isVeg,
      hidden: item.hidden ?? false,
      ingredients: item.ingredients ?? [],
      protein: String(item.protein ?? 0),
      kcal: String(item.kcal ?? 0),
      fiber: String(item.fiber ?? 0),
      carbs: String(item.carbs ?? 0),
      referencePrice: String(item.referencePrice ?? 0),
      sortOrder: String(item.sortOrder ?? 0),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      protein: Number(form.protein) || 0,
      kcal: Number(form.kcal) || 0,
      fiber: Number(form.fiber) || 0,
      carbs: Number(form.carbs) || 0,
      referencePrice: Number(form.referencePrice) || 0,
      sortOrder: Number(form.sortOrder) || 0,
      ...(editingId ? { _id: editingId } : {}),
    };
    const res = await fetch("/api/admin/subscription-menu", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      message.success(editingId ? "Item updated" : "Item added");
      resetForm();
      load();
    } else {
      message.error(data.message ?? "Failed to save");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    const res = await fetch(`/api/admin/subscription-menu?id=${id}`, { method: "DELETE" });
    if ((await res.json()).success) {
      message.success("Deleted");
      load();
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-[#111] mb-4">Subscription menu</h1>

      <form onSubmit={submit} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bracket</label>
            <Select
              value={form.bracket}
              options={BRACKET_OPTIONS}
              onChange={(v) => setForm({ ...form, bracket: v as ProteinBracketKey })}
              className="w-full"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          {(
            [
              ["Protein (g)", "protein"],
              ["Kcal", "kcal"],
              ["Fiber (g)", "fiber"],
              ["Carbs (g)", "carbs"],
              ["Reference price (₹, internal)", "referencePrice"],
              ["Sort order", "sortOrder"],
            ] as const
          ).map(([label, field]) => (
            <div key={field}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="number"
                value={form[field]}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
            <input
              type="url"
              placeholder="Optional"
              value={form.image}
              onChange={(e) => setForm({ ...form, image: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ingredients (one per line)
            </label>
            <textarea
              rows={3}
              value={(form.ingredients ?? []).join("\n")}
              onChange={(e) =>
                setForm({
                  ...form,
                  ingredients: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isVeg}
              onChange={(e) => setForm({ ...form, isVeg: e.target.checked })}
            />
            Vegetarian
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.hidden}
              onChange={(e) => setForm({ ...form, hidden: e.target.checked })}
            />
            Hidden from customers
          </label>
        </div>

        <div className="flex gap-2 mt-4">
          <button type="submit" className="bg-[#1c1c1c] text-white px-4 py-2 rounded-lg text-sm">
            {editingId ? "Update item" : "Add item"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Select
          value={bracketFilter}
          onChange={(v) => setBracketFilter(v)}
          options={[{ value: "all", label: "All brackets" }, ...BRACKET_OPTIONS]}
          style={{ width: 140 }}
        />
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          Show hidden
        </label>
        <span className="text-sm text-gray-400">{filtered.length} items</span>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={String(item._id)}
              className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex justify-between items-center"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 border-2 ${item.isVeg ? "border-green-600" : "border-red-600"} inline-flex items-center justify-center`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"}`}
                    />
                  </span>
                  <span className="font-medium text-[#111]">{item.name.trim()}</span>
                  {item.protein === 0 && (
                    <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                      needs data
                    </span>
                  )}
                  {item.hidden && (
                    <span className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                      hidden
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {item.bracket}g · {item.protein}g protein · ₹{item.referencePrice} ref
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(item)}
                  className="text-sm text-[#1c1c1c] underline"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(String(item._id))}
                  className="text-sm text-red-600 underline"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
