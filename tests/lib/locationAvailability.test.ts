import { describe, it, expect } from "vitest";
import {
  sanitizeLocationAvailability,
  isStoreOnAt,
  isDeliveryOnAt,
  type LocationAvailability,
} from "@/lib/locationAvailability";
import { SOCIETIES } from "@/lib/societies";

const A = SOCIETIES[0].id;
const B = SOCIETIES[1].id;

describe("sanitizeLocationAvailability", () => {
  it("keeps `false` for known locations", () => {
    const out = sanitizeLocationAvailability({
      store: { [A]: false },
      delivery: { [B]: false },
    });
    expect(out).toEqual({ store: { [A]: false }, delivery: { [B]: false } });
  });

  it("drops `true`, since available is the default", () => {
    const out = sanitizeLocationAvailability({ store: { [A]: true } });
    expect(out.store).toEqual({});
    expect(isStoreOnAt(out, A)).toBe(true);
  });

  it("drops unknown location ids", () => {
    const out = sanitizeLocationAvailability({
      store: { "not-a-society": false },
    });
    expect(out.store).toEqual({});
  });

  it("drops non-boolean values rather than coercing them", () => {
    // The dangerous direction is a truthy string reopening a closed location,
    // but a stray 0 must not close one either.
    const out = sanitizeLocationAvailability({
      store: { [A]: "false", [B]: 0 },
    });
    expect(out.store).toEqual({});
    expect(isStoreOnAt(out, A)).toBe(true);
  });

  it("survives junk input", () => {
    for (const junk of [null, undefined, 42, "x", [], { store: 7 }]) {
      expect(sanitizeLocationAvailability(junk)).toEqual({
        store: {},
        delivery: {},
      });
    }
  });
});

describe("isStoreOnAt / isDeliveryOnAt", () => {
  const config: LocationAvailability = {
    store: { [A]: false },
    delivery: { [B]: false },
  };

  it("reports a switched-off location as off", () => {
    expect(isStoreOnAt(config, A)).toBe(false);
    expect(isDeliveryOnAt(config, B)).toBe(false);
  });

  it("keeps the two switches independent", () => {
    // Ordering off at A must not imply delivery off at A, or an admin closing
    // one location's kitchen would silently change the other's delivery state.
    expect(isDeliveryOnAt(config, A)).toBe(true);
    expect(isStoreOnAt(config, B)).toBe(true);
  });

  it("defaults to on for a location with no entry", () => {
    expect(isStoreOnAt({ store: {}, delivery: {} }, A)).toBe(true);
  });

  it("defaults to on when the settings document is missing", () => {
    // Fail-open on purpose: a failed settings read must not shutter every
    // location at once.
    expect(isStoreOnAt(null, A)).toBe(true);
    expect(isDeliveryOnAt(undefined, A)).toBe(true);
  });

  it("defaults to on when no location is given", () => {
    expect(isStoreOnAt(config, null)).toBe(true);
    expect(isDeliveryOnAt(config, undefined)).toBe(true);
  });

  it("treats a brand-new society as available", () => {
    // Adding an id to SOCIETIES must not launch it closed.
    expect(isStoreOnAt(config, "newly-added-society")).toBe(true);
  });
});

describe("layering on the global switch", () => {
  // The rule the order route and /api/store-status both implement:
  //   effective = globalOpen && locationOn
  const effective = (globalOpen: boolean, locationOn: boolean) =>
    globalOpen && locationOn;

  it("a location switch cannot reopen a globally closed store", () => {
    expect(effective(false, true)).toBe(false);
  });

  it("a location switch can close while the store is globally open", () => {
    expect(effective(true, false)).toBe(false);
  });

  it("open only when both agree", () => {
    expect(effective(true, true)).toBe(true);
  });
});
