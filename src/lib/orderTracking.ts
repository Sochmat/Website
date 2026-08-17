import type { Order } from "@/lib/types";

/** The customer-facing tracking steps on /success, in display order. */
export const TRACKING_STEPS = [
  "Order Placed",
  "Preparing Order",
  "Out for Delivery",
  "Arrived at Location",
  "Delivered",
] as const;

/**
 * Which step each order status sits on.
 *
 * Admin "Accept" moves an order to `confirmed`, which means the kitchen has
 * taken it on — the rider has not left yet. Only `shipped` (the admin's
 * "Out for Delivery" button) puts the order on the road.
 */
export const STATUS_STEP_INDEX: Record<NonNullable<Order["status"]>, number> = {
  pending: 0,
  confirmed: 1,
  shipped: 2,
  delivered: 4,
  cancelled: 0,
};

/** Step index for an order whose status may not have loaded yet. */
export function trackingStepIndex(status?: Order["status"]): number {
  return status ? STATUS_STEP_INDEX[status] : 0;
}
