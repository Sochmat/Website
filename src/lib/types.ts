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
  description?: string;
  fiber?: number;
  carbs?: number;
  ingredients?: string[];
  image: string;
  isVeg: boolean;
  isAddOn?: boolean;
  isRecommended?: boolean;
  showOnHomePage?: boolean;
  isAvailableForSubscription?: boolean;
  addOns?: string[];
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
  discountType: "flat" | "percent";
  discountAmount: number;
  discountPercent?: number;
  maxDiscount?: number;
  minAmount?: number;
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

  paymentMethod?: "cash" | "card" | "upi" | "razorpay";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentId?: string;
  paymentUrl?: string;
  paymentSignature?: string;

  orderItems: OrderItem[];
  receiver?: User & { lat?: number; lng?: number };
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserAddress {
  id?: string;
  address: string;
  lat: number;
  long: number;
  pincode: string;
  receiverName?: string;
  receiverPhone?: string;
}

export interface MealCard {
  _id?: ObjectId | string;
  title: string;
  subtitle: string;
  images: string[];
  startingPrice: number;
  category?: string;
  link?: string;
  order: number;
  active: boolean;
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
  addresses?: UserAddress[];
  createdAt?: Date;
  updatedAt?: Date;
}
