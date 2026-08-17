import { describe, expect, it } from "vitest";
import {
  STATUS_STEP_INDEX,
  TRACKING_STEPS,
  trackingStepIndex,
} from "@/lib/orderTracking";

const stepFor = (status: Parameters<typeof trackingStepIndex>[0]) =>
  TRACKING_STEPS[trackingStepIndex(status)];

describe("order tracking steps", () => {
  it("starts a freshly placed order at Order Placed", () => {
    expect(stepFor("pending")).toBe("Order Placed");
  });

  it("keeps an accepted order on Preparing Order", () => {
    expect(stepFor("confirmed")).toBe("Preparing Order");
  });

  it("only reaches Out for Delivery once the order is shipped", () => {
    expect(stepFor("shipped")).toBe("Out for Delivery");
  });

  it("ends at Delivered", () => {
    expect(stepFor("delivered")).toBe("Delivered");
  });

  it("shows nothing past the first step before the order loads", () => {
    expect(trackingStepIndex(undefined)).toBe(0);
  });

  it("maps every status onto a real step", () => {
    for (const index of Object.values(STATUS_STEP_INDEX)) {
      expect(TRACKING_STEPS[index]).toBeDefined();
    }
  });
});
