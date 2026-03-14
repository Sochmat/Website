"use client";

import { useState, useEffect } from "react";

interface Tile {
  _id: string;
  label: string;
  sublabel: string;
  href: string;
  emoji: string;
  bgStyle: "gradient" | "bordered";
  order: number;
}

const DEFAULT_TILES: Omit<Tile, "_id">[] = [
  { label: "Protein", sublabel: "Shakes", href: "/menu", emoji: "🥤", bgStyle: "gradient", order: 0 },
  { label: "FOOD", sublabel: "", href: "/menu", emoji: "🥗", bgStyle: "bordered", order: 1 },
  { label: "Chef", sublabel: "Special", href: "/menu", emoji: "👨‍🍳", bgStyle: "bordered", order: 2 },
  { label: "MEALS", sublabel: "SUBSCRIPTION", href: "/subscribe", emoji: "📅", bgStyle: "bordered", order: 3 },
  { label: "MEMBERSHIP", sublabel: "@₹99", href: "/subscribe", emoji: "", bgStyle: "bordered", order: 4 },
  { label: "MEALS", sublabel: "@₹149", href: "/menu", emoji: "", bgStyle: "bordered", order: 5 },
];

const empty = (): Omit<Tile, "_id"> => ({
  label: "",
  sublabel: "",
  href: "/menu",
  emoji: "",
  bgStyle: "bordered",
  order: 0,
});

export default function AdminTilesPage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [form, setForm] = useState(empty());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    fetchTiles();
  }, []);

  const fetchTiles = async () => {
    try {
      const res = await fetch("/api/admin/tiles");
      const data = await res.json();
      if (data.success) setTiles(data.tiles);
    } catch (err) {
      console.error("Failed to fetch tiles:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingId) {
        await fetch("/api/admin/tiles", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, _id: editingId }),
        });
      } else {
        await fetch("/api/admin/tiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setForm(empty());
      setEditingId(null);
      fetchTiles();
    } catch (err) {
      console.error("Failed to save tile:", err);
    }
    setLoading(false);
  };

  const handleSeedDefaults = async () => {
    if (!confirm("This will add the 6 default tiles. Continue?")) return;
    setSeeding(true);
    try {
      await Promise.all(
        DEFAULT_TILES.map((tile) =>
          fetch("/api/admin/tiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tile),
          })
        )
      );
      fetchTiles();
    } catch (err) {
      console.error("Failed to seed tiles:", err);
    }
    setSeeding(false);
  };

  const handleEdit = (tile: Tile) => {
    setEditingId(tile._id);
    setForm({
      label: tile.label,
      sublabel: tile.sublabel ?? "",
      href: tile.href,
      emoji: tile.emoji ?? "",
      bgStyle: tile.bgStyle ?? "bordered",
      order: tile.order ?? 0,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this tile?")) return;
    try {
      await fetch(`/api/admin/tiles?id=${id}`, { method: "DELETE" });
      fetchTiles();
    } catch (err) {
      console.error("Failed to delete tile:", err);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(empty());
  };

  const set = (key: keyof typeof form, value: string | number) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {editingId ? "Edit Tile" : "Add Tile"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Label (top line)
                </label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => set("label", e.target.value)}
                  placeholder="e.g., Protein"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sublabel (bottom line)
                </label>
                <input
                  type="text"
                  value={form.sublabel}
                  onChange={(e) => set("sublabel", e.target.value)}
                  placeholder="e.g., Shakes or @₹99"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Link (href)
                </label>
                <input
                  type="text"
                  value={form.href}
                  onChange={(e) => set("href", e.target.value)}
                  placeholder="/menu or /subscribe"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Emoji icon
                </label>
                <input
                  type="text"
                  value={form.emoji}
                  onChange={(e) => set("emoji", e.target.value)}
                  placeholder="e.g., 🥤"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Background style
                </label>
                <select
                  value={form.bgStyle}
                  onChange={(e) =>
                    set("bgStyle", e.target.value as "gradient" | "bordered")
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                >
                  <option value="bordered">White bordered</option>
                  <option value="gradient">Orange gradient</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Order (lower = first)
                </label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) => set("order", Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
                />
              </div>
            </div>

            {/* Live preview */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
              <div
                className={`w-[96px] h-[120px] rounded-[9.6px] overflow-hidden flex flex-col items-center justify-center ${
                  form.bgStyle === "gradient"
                    ? ""
                    : "border border-[#d9d9d9] bg-white"
                }`}
                style={
                  form.bgStyle === "gradient"
                    ? { background: "linear-gradient(to bottom, #ffebd6, #e58857)" }
                    : undefined
                }
              >
                <p className="text-[13.2px] font-semibold text-black text-center uppercase leading-[14.4px] px-1">
                  {form.label || "Label"}
                </p>
                {form.sublabel && (
                  <p
                    className={`text-center uppercase leading-[16.8px] px-1 font-semibold ${
                      form.sublabel.startsWith("@")
                        ? "text-[24px] text-[#02583f]"
                        : form.sublabel.length > 8
                        ? "text-[9.6px] text-[#02583f]"
                        : "text-[13.2px] text-[#02583f]"
                    }`}
                  >
                    {form.sublabel}
                  </p>
                )}
                {form.emoji && (
                  <div className="mt-2 text-2xl leading-none">{form.emoji}</div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#02583f] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : editingId ? "Update Tile" : "Add Tile"}
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

        {/* Tiles list */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              Category Tiles ({tiles.length})
            </h2>
            <button
              type="button"
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="text-sm px-3 py-1.5 border border-[#02583f] text-[#02583f] rounded-lg hover:bg-[#02583f] hover:text-white transition-colors disabled:opacity-50"
            >
              {seeding ? "Adding..." : "Load Defaults"}
            </button>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {tiles.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No tiles yet. Add your first tile!
              </p>
            ) : (
              tiles.map((tile) => (
                <div
                  key={tile._id}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {/* Mini preview */}
                  <div
                    className={`w-12 h-14 rounded-lg shrink-0 flex flex-col items-center justify-center text-[8px] font-semibold text-center ${
                      tile.bgStyle === "gradient"
                        ? ""
                        : "border border-[#d9d9d9] bg-white"
                    }`}
                    style={
                      tile.bgStyle === "gradient"
                        ? { background: "linear-gradient(to bottom, #ffebd6, #e58857)" }
                        : undefined
                    }
                  >
                    <span className="text-black uppercase leading-tight px-0.5">{tile.label}</span>
                    {tile.sublabel && (
                      <span className="text-[#02583f] uppercase leading-tight px-0.5">{tile.sublabel}</span>
                    )}
                    {tile.emoji && <span className="text-sm leading-none mt-0.5">{tile.emoji}</span>}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">
                      {tile.label} {tile.sublabel && `/ ${tile.sublabel}`}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {tile.href} · order {tile.order}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(tile)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tile._id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
