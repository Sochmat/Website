import { describe, it, expect } from "vitest";
import { parseHost } from "./subdomain";

const ROOT = "kitchenos.app";

describe("parseHost", () => {
  it("resolves a tenant subdomain", () => {
    expect(parseHost("biryani-hub.kitchenos.app", ROOT)).toEqual({ kind: "tenant", slug: "biryani-hub" });
  });
  it("strips port", () => {
    expect(parseHost("biryani-hub.localhost:3000", "localhost")).toEqual({ kind: "tenant", slug: "biryani-hub" });
  });
  it("treats admin as super scope", () => {
    expect(parseHost("admin.kitchenos.app", ROOT)).toEqual({ kind: "super" });
  });
  it("treats apex as root", () => {
    expect(parseHost("kitchenos.app", ROOT)).toEqual({ kind: "root" });
  });
  it("treats www as root", () => {
    expect(parseHost("www.kitchenos.app", ROOT)).toEqual({ kind: "root" });
  });
  it("flags reserved non-admin slugs as root (never a tenant)", () => {
    expect(parseHost("api.kitchenos.app", ROOT)).toEqual({ kind: "root" });
  });
  it("returns unknown for a foreign host", () => {
    expect(parseHost("evil.com", ROOT)).toEqual({ kind: "unknown" });
  });
  it("returns unknown for null host", () => {
    expect(parseHost(null, ROOT)).toEqual({ kind: "unknown" });
  });
  it("lowercases the slug", () => {
    expect(parseHost("Biryani-Hub.kitchenos.app", ROOT)).toEqual({ kind: "tenant", slug: "biryani-hub" });
  });
});
