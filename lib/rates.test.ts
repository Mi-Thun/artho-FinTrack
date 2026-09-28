import { describe, expect, it } from "vitest";
import { percentToRate, rateToPercent } from "./rates";

describe("rate conversion", () => {
  it("prefills without float drift", () => {
    expect(rateToPercent(0.1122)).toBe(11.22);
    expect(rateToPercent("0.1065")).toBe(10.65);
  });

  it("stores without float drift", () => {
    expect(percentToRate("11.22")).toBe(0.1122);
    expect(percentToRate(10.65)).toBe(0.1065);
  });

  it("treats blank input as missing", () => {
    expect(percentToRate("")).toBeNull();
    expect(percentToRate("abc")).toBeNull();
  });
});
