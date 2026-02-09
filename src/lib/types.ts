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
  isAddOn?: boolean;
  isRecommended?: boolean;
  showOnHomePage?: boolean;
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

export interface Coupon {
  _id?: ObjectId | string;
  code: string;
  discountAmount: number;
  active: boolean;
  createdAt?: Date;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

export interface Order {
  _id?: ObjectId | string;
  orderNumber?: string;
  couponCode?: ObjectId | string;

  discountAmount?: number;
  deliveryFee?: number;
  tax?: number;
  netAmount?: number;
  totalAmount: number;

  paymentMethod?: "cash" | "card" | "upi";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentId?: string;
  paymentUrl?: string;
  paymentSignature?: string;

  orderItems: OrderItem[];
  receiver?: User;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  createdAt?: Date;
  updatedAt?: Date;
}

export interface User {
  _id?: ObjectId | string;
  phone: string;
  name?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
