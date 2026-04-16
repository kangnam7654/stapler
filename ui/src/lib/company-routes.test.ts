import { describe, expect, it } from "vitest";
import { applyCompanyPrefix, extractCompanyPrefixFromPath } from "./company-routes";

describe("extractCompanyPrefixFromPath", () => {
  it("returns null for known board route roots so they are not mistaken for company prefixes", () => {
    expect(extractCompanyPrefixFromPath("/dashboard")).toBeNull();
    expect(extractCompanyPrefixFromPath("/issues")).toBeNull();
    expect(extractCompanyPrefixFromPath("/messages")).toBeNull();
    expect(extractCompanyPrefixFromPath("/teams")).toBeNull();
    expect(extractCompanyPrefixFromPath("/simulation")).toBeNull();
  });

  it("returns normalized uppercase prefix for actual company segments", () => {
    expect(extractCompanyPrefixFromPath("/cmpaa/dashboard")).toBe("CMPAA");
    expect(extractCompanyPrefixFromPath("/CMPAA/messages")).toBe("CMPAA");
  });
});

describe("applyCompanyPrefix", () => {
  it("prefixes board routes that lack a company prefix", () => {
    expect(applyCompanyPrefix("/dashboard", "CMPAA")).toBe("/CMPAA/dashboard");
    expect(applyCompanyPrefix("/issues", "CMPAA")).toBe("/CMPAA/issues");
    expect(applyCompanyPrefix("/messages", "CMPAA")).toBe("/CMPAA/messages");
    expect(applyCompanyPrefix("/teams", "CMPAA")).toBe("/CMPAA/teams");
    expect(applyCompanyPrefix("/simulation", "CMPAA")).toBe("/CMPAA/simulation");
  });

  it("leaves global routes untouched", () => {
    expect(applyCompanyPrefix("/auth", "CMPAA")).toBe("/auth");
    expect(applyCompanyPrefix("/instance/settings/general", "CMPAA")).toBe("/instance/settings/general");
  });

  it("does not double-prefix when path already has a prefix", () => {
    expect(applyCompanyPrefix("/CMPAA/messages", "CMPAA")).toBe("/CMPAA/messages");
    expect(applyCompanyPrefix("/OTHER/dashboard", "CMPAA")).toBe("/OTHER/dashboard");
  });
});
