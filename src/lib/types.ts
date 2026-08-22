import { ObjectId } from "mongodb";
import type { FoodType } from "./foodType";

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
  fat?: number;
  ingredients?: string[];
  image: string;
  /** Veg / non-veg / egg. Read it with resolveFoodType() — older documents
   *  only have `isVeg`. */
  foodType?: FoodType;
  /** Legacy two-way flag, still written on every save (egg counts as
   *  non-veg) so the subscription menu and Petpooja sync keep working. */
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

/**
 * How the customer picks from an add-on category:
 *   - `single` — radio, at most one add-on, quantity 1
 *   - `multi`  — checkboxes, any number of different add-ons, quantity 1 each
 *   - `add`    — quantity stepper, several of the same add-on
 *
 * Absent means `add`: that is how every group behaved before types existed, so
 * documents written back then must keep behaving that way.
 */
export type AddOnSelectionType = "single" | "multi" | "add";

/** One add-on inside an add-on category. `price` overrides the add-on's own
 *  price for this category only; leave it unset to charge the add-on's price.
 *  The same add-on may sit in several categories at different prices. */
export interface AddOnCategoryMember {
  /** `menuItems` document id of an add-on. */
  addOnId: string;
  price?: number;
  /** Pre-ticked (quantity 1) when the add-to-cart sheet opens. The customer
   *  can still remove it — it is a suggestion, not a forced charge. At most one
   *  member of a category carries this. */
  defaultSelected?: boolean;
}

/**
 * A named group of add-ons offered on many menu items at once, instead of
 * picking the same add-ons item by item. Deliberately separate from `Category`
 * (which groups menu items): the admin's add-on tab treats any item with no
 * `category` as an add-on, so add-ons have to stay uncategorized there.
 *
 * The mapping is owned by this side — the group names the items it applies to,
 * via `itemIds` and `menuCategoryIds`; menu items carry no reference back.
 *
 * `members` is the display order within the group — the admin reorders it with
 * the arrow buttons in the category editor.
 */
export interface AddOnCategory {
  _id?: ObjectId | string;
  name: string;
  hidden?: boolean;
  /** The customer must take at least one add-on from this group before the
   *  item can go in the cart. Checked in the sheet only — the order API keeps
   *  recomputing prices, but does not reject a line for missing a group. */
  required?: boolean;
  /** See AddOnSelectionType. Absent = `add`. */
  selectionType?: AddOnSelectionType;
  members: AddOnCategoryMember[];
  /** Menu items this group is offered on, by `menuItems` document id. */
  itemIds?: string[];
  /** Menu categories this group is offered on, by `Category.id`. Every item in
   *  one gets the group, including items added later. */
  menuCategoryIds?: string[];
  /** Position among all add-on categories, low first. It is a single global
   *  order — the item no longer holds the list, so it cannot order the groups
   *  itself. Absent on documents written before ordering existed; those sort
   *  last. */
  sortOrder?: number;
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
  /**
   * Locations (society ids) this coupon runs at. Empty/absent = all locations.
   * See lib/couponScope.ts.
   */
  societyIds?: string[];
  /**
   * Keep the code out of the storefront's "View all coupons" list. It still
   * works — the customer has to know it and type it in.
   */
  hidden?: boolean;
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
  /** Society (delivery location) this order was placed for. */
  societyId?: string;
  /** Flat location discount applied (INR) and the % it was derived from. */
  societyDiscount?: number;
  societyDiscountPercent?: number;
  /** First-order 20% discount applied (INR); >0 marks the order as having claimed it. */
  firstOrderDiscount?: number;
  /** Wallet credit reserved/applied to this order (INR); reduces amountPayable. */
  walletApplied?: number;
  /** Amount actually charged (= totalAmount − walletApplied − pointsApplied). */
  amountPayable?: number;
  /** Reward points reserved/redeemed against this order; reduces amountPayable. */
  pointsApplied?: number;
  /** Reward points credited when this order was paid. */
  pointsEarned?: number;
  /** The earn rate (%) used for this order. */
  pointsRate?: number;
  /** The cap of the location's ladder at award time, frozen for the receipt. */
  pointsRateMax?: number;
  /** The streak day this order produced, for the success screen. */
  streakAfter?: number;
  /** True once this order's reward points have been claimed for awarding. */
  rewardsAwarded?: boolean;
  /** Structured delivery location (only set when orderType === "delivery"). */
  deliveryTower?: string;
  deliveryFloor?: string;
  deliveryRoom?: string;
  /** Assigned delivery slot window, e.g. "12:30–13:00" (slot-based societies). */
  deliverySlot?: string;

  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";

  /** When delivery spent this order's inventory. Present = already deducted,
   *  which is what stops a second "Delivered" click deducting twice. */
  stockConsumedAt?: Date;
  /** The inventoryOrderConsumptions record holding the deducted lines. */
  stockConsumptionId?: ObjectId | string;
  /** How many stock rows that deduction wrote. */
  stockConsumptionRows?: number;
  /** Ordered items with no item recipe — nothing was deducted for these. */
  stockConsumptionUnmapped?: string[];
  /** Set when the deduction failed after being claimed; needs a manual audit. */
  stockConsumptionError?: string;

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
  /** Unique share code, e.g. "HARSH1042". Assigned lazily on first use. */
  referralCode?: string;
  /** The referrer's user id, set once at registration for a brand-new user. */
  referredBy?: ObjectId | string;
  /** True once the referrer has been credited for this user's first paid order. */
  referralCredited?: boolean;
  /** Wallet balance in ₹ (from referral rewards). Missing = 0. */
  walletBalance?: number;
  /** Reward-point balance (1 point = ₹1). Missing = 0. */
  rewardPoints?: number;
  /** Current consecutive-day order streak. Missing = 0. */
  streakCount?: number;
  /** IST calendar date (yyyy-mm-dd) of the last streak-advancing paid order. */
  streakLastDate?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Append-only wallet ledger entry (collection: walletTransactions). */
export interface WalletTransaction {
  _id?: ObjectId | string;
  userId: ObjectId | string;
  /** referral_earned → credit; reserved/spent/refunded → order redemption. */
  type: "referral_earned" | "reserved" | "spent" | "refunded";
  /** Always a positive amount in ₹. */
  amount: number;
  /** The order this entry relates to (redemption entries). */
  orderId?: ObjectId | string;
  /** The referred user whose first order earned a referral reward. */
  refereeUserId?: ObjectId | string;
  createdAt?: Date;
}

/** Append-only reward-point ledger entry (collection: rewardTransactions). */
export interface RewardTransaction {
  _id?: ObjectId | string;
  userId: ObjectId | string;
  /**
   * earned → credit at payment; reserved/spent/refunded → order redemption;
   * reversed → clawback when a paid order is refunded.
   */
  type: "earned" | "reserved" | "spent" | "refunded" | "reversed";
  /** Always a positive amount in points. */
  amount: number;
  /** The order this entry relates to. */
  orderId?: ObjectId | string;
  /** The earn rate (%) applied, on `earned` entries. */
  rate?: number;
  /** The streak day reached, on `earned` entries. */
  streakAfter?: number;
  createdAt?: Date;
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
  /** Per-meal delivery address override (snapshot). Falls back to the plan's
   *  `receiver` when unset, so most meals need no per-meal address at all. */
  receiver?: {
    name: string;
    phone: string;
    address: string;
    lat?: number;
    long?: number;
  };
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
