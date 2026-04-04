"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import MenuItem from "./MenuItem";
import CategoryFilter from "./CategoryFilter";
import { Product } from "@/context/CartContext";
import { Category } from "@/lib/types";

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
};

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
  ingredients?: string[];
  image: string;
  isVeg: boolean;
  category?: string;
  type?: string;
  showOnHomePage?: boolean;
  isAvailableForSubscription?: boolean;
  addOns?: string[];
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
    ingredients: item.ingredients ?? [],
    image: item.image,
    isVeg: item.isVeg,
    category: item.category,
    showOnHomePage: item.showOnHomePage ?? false,
    type: item.type,
    isAvailableForSubscription: item.isAvailableForSubscription ?? false,
    addOns: item.addOns ?? [],
  };
}

interface MenuProps {
  showTitle?: boolean;
  linkCategoriesToMenu?: boolean;
  className?: string;
  showOnHomePage?: boolean;
  initialCategory?: "food" | "beverages";
  initialActiveCategory?: string | null;
  hideHeader?: boolean;
}

export default function Menu({
  showTitle = true,
  linkCategoriesToMenu = false,
  className = "",
  showOnHomePage = false,
  initialCategory = "food",
  initialActiveCategory = null,
  hideHeader = false,
}: MenuProps) {
  const [activeTab, setActiveTab] = useState<"food" | "beverages">(
    initialCategory,
  );
  const [activeCategory, setActiveCategory] = useState<string | null>(
    initialActiveCategory,
  );
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(initialCategory);
  }, [initialCategory]);

  useEffect(() => {
    let cancelled = false;
    async function fetchMenu() {
      try {
        const res = await fetch("/api/menu");
        const data = await res.json();
        if (cancelled || !data.success) return;
        const items = (data.items ?? []).map(mapApiItemToProduct);
        setProducts(items);
        if (data.categories?.length) {
          setCategories(
            data.categories.map((c: Category) => ({
              id: c.id,
              name: c.name,
              image: c.image ?? defaultCategories[0]?.image ?? "",
              type: c.type,
            })),
          );
          if (!initialActiveCategory) {
            setActiveCategory(data.categories[0]?.id ?? null);
          }
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

  const listProducts = products.filter(
    (p) =>
      (p.type ?? "food") === activeTab &&
      (activeCategory === "all" ||
        !p.category ||
        p.category === activeCategory),
  );

  const displayProducts = listProducts;

  return (
    <div className={className}>
      {!hideHeader && (
        <>
          {showTitle && (
            <div className="text-center mb-2">
              <h2 className="font-squada text-[48px] text-[#02583f] uppercase tracking-tight">
                Menu
              </h2>
              <p className="font-satisfy text-[#f56215] text-2xl -rotate-2">
                Healthy Meals
              </p>
            </div>
          )}

          <div className="bg-[#f0f0f0] p-0.5 rounded-lg flex mt-6">
            <button
              onClick={() => setActiveTab("food")}
              className={`flex-1 py-2 px-5 rounded-lg font-medium transition-colors ${
                activeTab === "food" ? "bg-[#02583f] text-white" : "text-[#111]"
              }`}
            >
              Food
            </button>
            <button
              onClick={() => setActiveTab("beverages")}
              className={`flex-1 py-2 px-5 rounded-lg font-medium transition-colors ${
                activeTab === "beverages"
                  ? "bg-[#02583f] text-white"
                  : "text-[#111]"
              }`}
            >
              Beverages
            </button>
          </div>

          <CategoryFilter
            activeTab={activeTab}
            categories={categories}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        </>
      )}

      <div className="py-4 flex flex-col gap-5">
        {loading ? (
          <p className="text-center text-gray-500 py-8">Loading menu...</p>
        ) : error ? (
          <p className="text-center text-red-500 py-8">{error}</p>
        ) : (
          displayProducts
            .filter((product) =>
              showOnHomePage ? product.showOnHomePage : true,
            )
            .map((product) => <MenuItem key={product.id} product={product} />)
        )}
      </div>
    </div>
  );
}
