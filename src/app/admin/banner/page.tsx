"use client";

import { useState, useEffect } from "react";

interface BannerSlide {
  _id: string;
  url: string;
  order: number;
}

export default function AdminBannerPage() {
  const [slides, setSlides] = useState<BannerSlide[]>([]);
  const [url, setUrl] = useState("");
  const [order, setOrder] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSlides();
  }, []);

  const fetchSlides = async () => {
    try {
      const res = await fetch("/api/admin/banner");
      const data = await res.json();
      if (data.success) setSlides(data.slides);
    } catch (err) {
      console.error("Failed to fetch banner slides:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    try {
      if (editingId) {
        await fetch("/api/admin/banner", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ _id: editingId, url, order: Number(order) }),
        });
      } else {
        await fetch("/api/admin/banner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, order: Number(order) }),
        });
      }
      setUrl("");
      setOrder("0");
      setEditingId(null);
      fetchSlides();
    } catch (err) {
      console.error("Failed to save slide:", err);
    }
    setLoading(false);
  };

  const handleEdit = (slide: BannerSlide) => {
    setEditingId(slide._id);
    setUrl(slide.url);
    setOrder(String(slide.order));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this banner slide?")) return;
    try {
      await fetch(`/api/admin/banner?id=${id}`, { method: "DELETE" });
      fetchSlides();
    } catch (err) {
      console.error("Failed to delete slide:", err);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setUrl("");
    setOrder("0");
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            {editingId ? "Edit Banner Slide" : "Add Banner Slide"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Image URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Order (lower = first)
              </label>
              <input
                type="number"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1c1c1c] focus:border-transparent"
              />
            </div>
            {url && (
              <div className="rounded-lg overflow-hidden h-36 bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt="Preview"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-[#1c1c1c] text-white py-2 rounded-lg font-medium hover:bg-[#024731] transition-colors disabled:opacity-50"
              >
                {loading ? "Saving..." : editingId ? "Update Slide" : "Add Slide"}
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

        {/* Slides list */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Banner Slides ({slides.length})
          </h2>
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {slides.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No slides yet. Add your first banner image!
              </p>
            ) : (
              slides.map((slide) => (
                <div
                  key={slide._id}
                  className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slide.url}
                    alt=""
                    className="w-20 h-14 object-cover rounded-lg shrink-0 bg-gray-100"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 truncate">{slide.url}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Order: {slide.order}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleEdit(slide)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(slide._id)}
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
