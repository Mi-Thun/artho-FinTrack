import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { ZERO, money, roundMoney, sumBy, sumMoney, toNumber } from "./money";

describe("money", () => {
  it("passes Decimals through and coerces numbers and strings", () => {
    expect(money(new Prisma.Decimal("12.34")).toString()).toBe("12.34");
    expect(money(12.34).toString()).toBe("12.34");
    expect(money("12.34").toString()).toBe("12.34");
  });

  it("treats null, undefined, and unparseable input as zero", () => {
    expect(money(null).toString()).toBe("0");
    expect(money(undefined).toString()).toBe("0");
    expect(money("not a number").toString()).toBe("0");
    expect(money(Number.NaN).toString()).toBe("0");
    expect(money(Number.POSITIVE_INFINITY).toString()).toBe("0");
  });
});

describe("sumMoney", () => {
  it("sums exactly where floating point does not", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in binary floating point.
    expect(sumMoney([0.1, 0.2]).toString()).toBe("0.3");
  });

  it("does not accumulate error over many rows", () => {
    const hundredth = Array.from({ length: 1000 }, () => "0.01");
    expect(sumMoney(hundredth).toString()).toBe("10");

    // The naive float equivalent misses.
    const naive = hundredth.reduce((s, x) => s + Number(x), 0);
    expect(naive).not.toBe(10);
  });

  it("is zero for an empty collection", () => {
    expect(sumMoney([]).equals(ZERO)).toBe(true);
  });
});

describe("sumBy", () => {
  it("sums a projection exactly", () => {
    const rows = [{ amount: "0.1" }, { amount: "0.2" }, { amount: "0.3" }];
    expect(sumBy(rows, (r) => r.amount).toString()).toBe("0.6");
  });

  it("skips null amounts rather than poisoning the total", () => {
    const rows = [{ amount: "10" }, { amount: null }, { amount: "5" }];
    expect(sumBy(rows, (r) => r.amount).toString()).toBe("15");
  });
});

describe("roundMoney", () => {
  it("rounds to poisha, half away from zero", () => {
    expect(roundMoney("1.005").toString()).toBe("1.01");
    expect(roundMoney("1.004").toString()).toBe("1");
    expect(roundMoney("-1.005").toString()).toBe("-1.01");
  });

  it("leaves values already at two places alone", () => {
    expect(roundMoney("1234.56").toString()).toBe("1234.56");
  });
});

describe("toNumber", () => {
  it("rounds and converts in one step", () => {
    expect(toNumber("1.005")).toBe(1.01);
    expect(toNumber(null)).toBe(0);
  });

  it("converts a summed Decimal cleanly", () => {
    expect(toNumber(sumMoney(["0.1", "0.2"]))).toBe(0.3);
  });
});
