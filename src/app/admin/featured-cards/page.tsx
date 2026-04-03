"use client";

import { useState, useEffect } from "react";

interface FeaturedCard {
  _id: string;
  title: string;
  subtitle: string;
  image: string;
  startingPrice: number;
  link: string;
  order: number;
  active: boolean;
}

const EMPTY_FORM = {
  title: "",
  subtitle: "",
  image: "",
  startingPrice: "199",
  link: "/menu",
  order: "0",
  active: true,
};

export default function AdminFeaturedCardsPage() {
  const [cards, setCards] = useState<FeaturedCard[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      const res = await fetch("/api/admin/featured-cards");
      const data = await res.json();
      if (data.success) setCards(data.cards);
    } catch (err) {
      console.error("Failed to fetch featured cards:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.image.trim()) return;
    setLoading(true);
    try {
      const payload = {
        ...form,
        startingPrice: Number(form.startingPrice),
        order: Number(form.order),
      };
      if (editingId) {
        await fetch("/api/admin/featured-cards", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _id: editingId, ...payload }),
        });
      } else {
        await fetch("/api/admin/featured-cards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      fetchCards();
    } catch (err) {
      console.error("Failed to save card:", err);
    }
    setLoading(false);
  };

  const handleEdit = (card: FeaturedCard) => {
    setEditingId(card._id);
    setForm({
      title: card.title,
      subtitle: card.subtitle,
      image: card.image,
      startingPrice: String(card.startingPrice),
      link: card.link,
      order: String(card.order),
      active: card.active,
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this featured card?")) return;
    try {
      await fetch(`/api/admin/featured-cards?id=${id}`, { method: "DELETE" });
      fetchCards();
    } catch (err) {
      console.error("Failed to delete card:", err);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const field = (label: string, key: keyof typeof EMPTY_FORM, type = "text", placeholder = "") => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={String(form[key])}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#02583f] focus:border-transparent"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {editingId ? "Edit Featured Card" : "Add Featured Card"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {field("Title", "title", "text", "Comfort Daily Meal")}
            {field("Subtitle", "subtitle", "text", "High rated home made meal…")}
            {field("Image URL", "image", "url", "https://example.com/image.jpg")}
            {field("Starting Price (₹)", "startingPrice", "number", "199")}
            {field("Link (tap destination)", "link", "text", "/menu")}
            {field("Order (lower = first)", "order", "number", "0")}

            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                className="w-4 h-4 accent-[#02583f]"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700">
                Active (visible on homepage)
              </label>
            </div>

            {form.image && (
              <div className="rounded-lg overflow-hidden h-40 bg-gray-100 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.image}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                {/* Price overlay preview */}
                <div className="absolute bottom-2 right-2 text-right bg-white/80 rounded px-2 py-0.5">
                  <p className="text-[#444] text-[9px] uppercase tracking-wide">Starting at</p>
                  <p className="text-[#f28a1d] font-semibold text-sm leading-tight">
                    ₹{form.startingPrice || "0"}
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#02583f] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : editingId ? "Update Card" : "Add Card"}
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

        {/* Cards list */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Featured Cards ({cards.length})
          </h2>
          <div className="space-y-3 max-h-[600px] overflow-y-auto">
            {cards.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No featured cards yet. Add your first card!
              </p>
            ) : (
              cards.map((card) => (
                <div
                  key={card._id}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image}
                    alt=""
                    className="w-20 h-14 object-cover rounded-lg shrink-0 bg-gray-100"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='56' fill='%23e5e7eb'%3E%3Crect width='80' height='56'/%3E%3C/svg%3E";
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-800 truncate">{card.title}</p>
                    <p className="text-xs text-gray-500 truncate">{card.subtitle}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-[#f28a1d] font-semibold">₹{card.startingPrice}</span>
                      <span className="text-xs text-gray-400">· order {card.order}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full ${
                          card.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {card.active ? "Active" : "Hidden"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(card)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(card._id)}
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
