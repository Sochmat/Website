import { describe, it, expect } from "vitest";
import { readSlugFromHeaders, readScopeFromHeaders } from "./tenantContext";

describe("tenantContext pure readers", () => {
  it("reads slug header", () => {
    expect(readSlugFromHeaders(new Headers({ "x-tenant-slug": "biryani-hub" }))).toBe("biryani-hub");
  });
  it("returns null when absent", () => {
    expect(readSlugFromHeaders(new Headers())).toBeNull();
  });
  it("reads scope header defaulting to unknown", () => {
    expect(readScopeFromHeaders(new Headers({ "x-tenant-scope": "super" }))).toBe("super");
    expect(readScopeFromHeaders(new Headers())).toBe("unknown");
  });
});
