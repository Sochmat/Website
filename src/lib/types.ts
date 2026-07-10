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
  /** Gates the "Subscribe" choice on the à-la-carte item card, which routes to
   *  the legacy single-item /subscribe flow. Unrelated to the bracket plans. */
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
  id: string;
  name: string;
  image: string;
  type: "food" | "beverages";
  hidden?: boolean;
}

export interface Coupon {
  _id?: ObjectId | string;
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

export const BRACKET_KEYS = ["25-30", "30-40", "40-50"] as const;
export type ProteinBracketKey = (typeof BRACKET_KEYS)[number];

/** "veg" = veg items only, veg price. "veg-nonveg" = both lists, non-veg price. */
export type SubscriptionDiet = "veg" | "veg-nonveg";

/** Flat per-meal pricing for one protein bracket. Admin-editable, and the only
 *  source of truth the server will price a plan from. Collection: `subscriptionBrackets`. */
export interface SubscriptionBracket {
  _id?: ObjectId | string;
  key: ProteinBracketKey;
  label: string; // "25-30g protein"
  proteinMin: number;
  proteinMax: number;
  /** Pre-GST price of ONE meal on a veg-only plan. */
  vegPrice: number;
  /** Pre-GST price of ONE meal on a veg+non-veg plan (charged even for veg meals). */
  nonVegPrice: number;
  sortOrder: number;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** A meal offered inside a subscription bracket. Collection: `subscriptionMenuItems`,
 *  which is completely independent of the à-la-carte `menuItems`. There is no
 *  per-item price: the plan's bracket + diet sets it. */
export interface SubscriptionMenuItem {
  _id?: ObjectId | string;
  bracket: ProteinBracketKey;
  name: string;
  /** Normalized `name`, recomputed on every write. Search + duplicate detection. */
  nameKey: string;
  /** Immutable identity of the source spreadsheet row, and the importer's upsert
   *  key — so an admin renaming an item never causes a duplicate on re-import.
   *  Absent for items created by hand in the admin UI. */
  importKey?: string;
  description?: string;
  /** 0 means "unknown"; the importer marks such rows `hidden` for an admin to fix. */
  protein: number;
  kcal: number;
  fiber?: number;
  carbs?: number;
  image: string;
  isVeg: boolean;
  ingredients?: string[];
  /** The spreadsheet's `price` column. INTERNAL ONLY — never serialized to a
   *  customer response. Kept for margin analysis. See `toPublicSubscriptionItem`. */
  referencePrice: number;
  hidden?: boolean;
  sortOrder?: number;
  source?: "sheet" | "admin";
  createdAt?: Date;
  updatedAt?: Date;
}

export type SubscriptionCreditStatus =
  | "available" // unassigned, spendable
  | "scheduled" // assigned to a date + item, editable until that date's noon IST
  | "delivered" // kitchen fulfilled it
  | "expired" // still available when the plan's expiresOn passed
  | "cancelled"; // admin-voided

/** One of the meals bought. Item fields are snapshotted at schedule time, so a
 *  later admin edit to the menu item cannot mutate a locked delivery. */
export interface SubscriptionCredit {
  /** Stable within the plan: "c1".."c7". Never reused. */
  id: string;
  status: SubscriptionCreditStatus;
  /** IST calendar date (yyyy-mm-dd). Set iff status is scheduled | delivered. */
  date?: string;
  weekday?: string;
  /** `subscriptionMenuItems._id` as a string. */
  productId?: string;
  itemName?: string;
  protein?: number;
  kcal?: number;
  isVeg?: boolean;
  scheduledAt?: Date;
  deliveredAt?: Date;
  expiredAt?: Date;
  cancelledAt?: Date;
}

/** A purchase of N meal credits inside one bracket + diet.
 *  Collection: `subscriptionMealPlans`. */
export interface SubscriptionMealPlan {
  _id?: ObjectId | string;
  planNumber: string;
  userId: ObjectId | string;

  bracket: ProteinBracketKey;
  diet: SubscriptionDiet;

  /** Pre-GST price of ONE meal, frozen at purchase. Later bracket price edits
   *  never re-price an existing plan. */
  pricePerMeal: number;
  mealCount: number;
  subtotal: number;
  tax: number;
  totalAmount: number;

  credits: SubscriptionCredit[]; // length === mealCount

  /** Set at payment success. Expiry anchors here, not on createdAt. */
  activatedAt?: Date;
  /** Last IST calendar date a credit may be delivered on, inclusive. Empty until paid. */
  expiresOn: string;
  expiresAt?: Date;

  receiver: {
    name: string;
    phone: string;
    address: string;
    lat?: number;
    long?: number;
  };
  deliveryTime: string; // "HH:mm" IST, applies to every scheduled day

  paymentMethod: "razorpay";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentId?: string;
  razorpayOrderId?: string;

  /** "pending" until paid. "completed" when no credit is available or scheduled. */
  status: "pending" | "active" | "completed" | "expired" | "cancelled";

  createdAt?: Date;
  updatedAt?: Date;
}
