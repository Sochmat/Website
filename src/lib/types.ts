import { ObjectId } from "mongodb";

/** A selectable size/option for a menu item. The price REPLACES the item's
 * base price when chosen (e.g. Small/Medium/Large). `name` is free-text. */
export interface MenuVariant {
  name: string;
  price: number;
}

/** A concrete add-on choice captured at add-to-cart time. */
export interface SelectedAddOn {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface MenuItem {
  _id?: ObjectId | string;
  tenantId?: string;
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
  hidden?: boolean;
  addOns?: string[];
  variants?: MenuVariant[];
  category: string;
  type: "food" | "beverages";
  petpoojaItemId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Category {
  _id?: ObjectId | string;
  tenantId?: string;
  id: string;
  name: string;
  image: string;
  type: "food" | "beverages";
  hidden?: boolean;
}

export interface Coupon {
  _id?: ObjectId | string;
  tenantId?: string;
  code: string;
  discountType: "flat" | "percent" | "freeItem";
  discountAmount: number;
  discountPercent?: number;
  maxDiscount?: number;
  minAmount?: number;
  /** Menu item granted free when discountType === "freeItem". */
  freeItemId?: string;
  active: boolean;
  createdAt?: Date;
}

export interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
  /** Chosen variant label, if the item had variants. */
  variantName?: string;
  /** Add-ons selected for this line, with their quantities. */
  addOns?: SelectedAddOn[];
}

export interface Order {
  _id?: ObjectId | string;
  tenantId?: string;
  orderNumber?: string;
  userId?: ObjectId | string;
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
  /** Razorpay order id bound to this order at payment verification time. */
  razorpayOrderId?: string;
  /** Razorpay refund id + time, set when an order is rejected & refunded. */
  refundId?: string;
  refundedAt?: Date;
  /** Frozen ETA stamped at successful payment (paidAt + 30 min). */
  expectedReadyAt?: Date | string;
  /** Time the order was first accepted/confirmed (drives the shop timer). */
  confirmedAt?: Date | string;

  orderItems: OrderItem[];
  method?: "Dine-in" | "Delivery";
  receiver?: User & { lat?: number; lng?: number };
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;

  /** How the customer receives the order. */
  orderType?: "dine-in" | "delivery";
  /** Structured delivery location (only set when orderType === "delivery"). */
  deliveryTower?: string;
  deliveryFloor?: string;
  deliveryRoom?: string;

  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

  petpoojaStatus?: "success" | "failed" | "skipped";
  petpoojaOrderId?: string;
  petpoojaError?: string;
  petpoojaPushedAt?: Date;

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
  pickupAtStore?: boolean;
}

export interface MealCard {
  _id?: ObjectId | string;
  tenantId?: string;
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
  tenantId?: string;
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

export type Role = "superadmin" | "kitchen-admin" | "shop";

export interface TenantBranding { logoUrl: string; primaryColor: string; accentColor: string; }
export interface TenantDeliveryZone { id: string; name: string; sector: string; towers: string[]; }
export interface TenantIntegrations {
  razorpay: { keyId: string; keySecretEnc: string; enabled: boolean } | null;
  petpooja: { appKey: string; appSecretEnc: string; accessToken: string; restId: string; enabled: boolean } | null;
  smtp: { host: string; port: number; user: string; passEnc: string; from: string; secure: boolean; authMethod: string } | null;
  printAgentToken: string;
}
export interface Tenant {
  _id?: string;
  slug: string;
  name: string;
  legalName: string;
  status: "active" | "suspended";
  branding: TenantBranding;
  contact: { phone: string; email: string; address: string };
  compliance: { gstNo: string; fssaiNo: string };
  location: { lat: number; lng: number; serviceRadiusKm: number };
  deliveryZones: TenantDeliveryZone[];
  integrations: TenantIntegrations;
  createdAt?: Date;
  updatedAt?: Date;
}
export interface AdminUser {
  _id?: string;
  tenantId: string | null;
  email: string;
  passwordHash: string;
  role: Role;
  name: string;
  createdAt?: Date;
  updatedAt?: Date;
}
