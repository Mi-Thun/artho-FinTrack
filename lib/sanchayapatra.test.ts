import { describe, expect, it } from "vitest";
import {
  SCHEMES,
  SCHEME_KEYS,
  buildCertificatePortfolio,
  ceilingUsage,
  projectCertificate,
  schemeDefinition,
  schemeNeedsReview,
  sourceTaxRate,
  type CertificateInput,
} from "./sanchayapatra";

const PURCHASE = new Date(Date.UTC(2024, 0, 15));

function cert(overrides: Partial<CertificateInput> = {}): CertificateInput {
  return {
    scheme: "PARIWAR",
    label: "Pariwar 1",
    principal: 1000000,
    purchaseDate: PURCHASE,
    holderType: "SINGLE",
    ...overrides,
  };
}

describe("scheme registry", () => {
  it("keys every definition by itself", () => {
    for (const key of SCHEME_KEYS) expect(SCHEMES[key].key).toBe(key);
  });

  it("returns null for the OTHER catch-all", () => {
    expect(schemeDefinition("OTHER")).toBeNull();
  });

  it("gives every scheme a plausible rate, tenure, and ceiling", () => {
    for (const key of SCHEME_KEYS) {
      const s = SCHEMES[key];
      expect(s.annualRate).toBeGreaterThan(0);
      expect(s.annualRate).toBeLessThan(0.3);
      expect(s.tenureMonths).toBeGreaterThan(0);
      expect(s.ceilingSingle).toBeGreaterThan(0);
      expect(s.labelBn.length).toBeGreaterThan(0);
    }
  });

  it("flags figures older than a year for review", () => {
    const scheme = SCHEMES.PARIWAR;
    expect(schemeNeedsReview(scheme, new Date("2025-06-01T00:00:00Z"))).toBe(false);
    expect(schemeNeedsReview(scheme, new Date("2027-06-01T00:00:00Z"))).toBe(true);
  });
});

describe("sourceTaxRate", () => {
  it("is 5% at or below the threshold and 10% above it", () => {
    expect(sourceTaxRate(400000)).toBe(0.05);
    expect(sourceTaxRate(500000)).toBe(0.05);
    expect(sourceTaxRate(500001)).toBe(0.1);
  });
});

describe("projectCertificate", () => {
  it("computes a monthly payout net of source tax", () => {
    // Pariwar: 11.52% on 10,00,000 = 1,15,200/yr = 9,600/month gross.
    const p = projectCertificate(cert(), new Date(Date.UTC(2024, 6, 15)), 0.1);
    expect(p.grossPerPayout).toBeCloseTo(9600, 2);
    expect(p.netPerPayout).toBeCloseTo(8640, 2);
  });

  it("accrues profit only for elapsed payout periods", () => {
    // Six months after purchase: six monthly payouts.
    const p = projectCertificate(cert(), new Date(Date.UTC(2024, 6, 15)), 0.1);
    expect(p.grossProfitToDate).toBeCloseTo(9600 * 6, 2);
  });

  it("sets maturity by the scheme's tenure", () => {
    const p = projectCertificate(cert(), PURCHASE, 0.1);
    // Pariwar is 60 months.
    expect(p.maturityDate.toISOString().slice(0, 10)).toBe("2029-01-15");
    expect(p.isMatured).toBe(false);
  });

  it("stops accruing at maturity", () => {
    const atMaturity = projectCertificate(cert(), new Date(Date.UTC(2029, 0, 15)), 0.1);
    const wellAfter = projectCertificate(cert(), new Date(Date.UTC(2035, 0, 15)), 0.1);
    expect(wellAfter.grossProfitToDate).toBeCloseTo(atMaturity.grossProfitToDate, 2);
    expect(wellAfter.isMatured).toBe(true);
    expect(wellAfter.nextPayoutDate).toBeNull();
  });

  it("treats an AT_MATURITY scheme as accruing rather than paying out", () => {
    const p = projectCertificate(
      cert({ scheme: "FIVE_YEAR_BSP", label: "BSP" }),
      new Date(Date.UTC(2025, 0, 15)),
      0.1,
    );
    expect(p.payout).toBe("AT_MATURITY");
    expect(p.grossPerPayout).toBe(0);
    // One year at 11.28%.
    expect(p.grossProfitToDate).toBeCloseTo(112800, 0);
    expect(p.nextPayoutDate?.toISOString().slice(0, 10)).toBe("2029-01-15");
  });

  it("reports total profit over the full term", () => {
    const p = projectCertificate(cert(), PURCHASE, 0.1);
    // 11.52% × 5 years on 10,00,000.
    expect(p.grossProfitAtMaturity).toBeCloseTo(576000, 0);
    expect(p.netProfitAtMaturity).toBeCloseTo(518400, 0);
  });
});

describe("ceilingUsage", () => {
  it("reports remaining headroom per scheme", () => {
    const usage = ceilingUsage([cert({ principal: 2000000 })]);
    const pariwar = usage.find((u) => u.scheme === "PARIWAR")!;
    expect(pariwar.invested).toBe(2000000);
    expect(pariwar.ceiling).toBe(4500000);
    expect(pariwar.remaining).toBe(2500000);
    expect(pariwar.isOverCeiling).toBe(false);
  });

  it("sums multiple certificates in the same scheme", () => {
    const usage = ceilingUsage([cert({ principal: 2000000 }), cert({ principal: 1000000 })]);
    expect(usage.find((u) => u.scheme === "PARIWAR")!.invested).toBe(3000000);
  });

  it("detects breaching the ceiling", () => {
    const usage = ceilingUsage([cert({ principal: 5000000 })]);
    const pariwar = usage.find((u) => u.scheme === "PARIWAR")!;
    expect(pariwar.isOverCeiling).toBe(true);
    expect(pariwar.remaining).toBe(0);
  });

  it("uses the joint ceiling when any holding is joint", () => {
    const single = ceilingUsage([cert({ scheme: "FIVE_YEAR_BSP", principal: 1000 })]);
    const joint = ceilingUsage([cert({ scheme: "FIVE_YEAR_BSP", principal: 1000, holderType: "JOINT" })]);
    expect(single.find((u) => u.scheme === "FIVE_YEAR_BSP")!.ceiling).toBe(3000000);
    expect(joint.find((u) => u.scheme === "FIVE_YEAR_BSP")!.ceiling).toBe(6000000);
  });

  it("excludes encashed certificates from the ceiling", () => {
    const usage = ceilingUsage([cert({ principal: 4000000, encashedAt: new Date() })]);
    expect(usage.find((u) => u.scheme === "PARIWAR")!.invested).toBe(0);
  });
});

describe("buildCertificatePortfolio", () => {
  const asOf = new Date(Date.UTC(2024, 6, 15));

  it("applies the higher source-tax tier once total investment exceeds the threshold", () => {
    const small = buildCertificatePortfolio([cert({ principal: 400000 })], asOf);
    const large = buildCertificatePortfolio([cert({ principal: 400000 }), cert({ principal: 400000 })], asOf);
    expect(small.appliedTaxRate).toBe(0.05);
    expect(large.appliedTaxRate).toBe(0.1);
  });

  it("lists payouts due within 90 days, soonest first", () => {
    const portfolio = buildCertificatePortfolio([cert(), cert({ label: "Pariwar 2" })], asOf);
    expect(portfolio.upcomingPayouts.length).toBeGreaterThan(0);
    for (let i = 1; i < portfolio.upcomingPayouts.length; i++) {
      expect(portfolio.upcomingPayouts[i].date.getTime()).toBeGreaterThanOrEqual(
        portfolio.upcomingPayouts[i - 1].date.getTime(),
      );
    }
  });

  it("excludes encashed certificates from principal but still projects them", () => {
    const portfolio = buildCertificatePortfolio(
      [cert({ principal: 1000000, encashedAt: new Date(Date.UTC(2024, 5, 1)) })],
      asOf,
    );
    expect(portfolio.totalPrincipal).toBe(0);
    expect(portfolio.projections).toHaveLength(1);
    expect(portfolio.projections[0].isEncashed).toBe(true);
    expect(portfolio.upcomingPayouts).toHaveLength(0);
  });
});
