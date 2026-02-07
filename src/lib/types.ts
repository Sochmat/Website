import { ObjectId } from "mongodb";

export interface MenuItem {
  _id?: ObjectId | string;
  name: string;
  kcal: number;
  protein: number;
  price: number;
  originalPrice: number;
  discount?: string;
  rating?: number;
  reviews?: string;
  badge?: string | null;
  image: string;
  isVeg: boolean;
  category: string;
  type: "food" | "beverages";
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Category {
  _id?: ObjectId | string;
  id: string;
  name: string;
  image: string;
  type: "food" | "beverages";
}
