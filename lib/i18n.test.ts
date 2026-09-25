import { describe, expect, it } from "vitest";
import {
  applyNumerals,
  createFormatter,
  localiseAmountsInText,
  MESSAGES,
  toBengaliNumerals,
  toWesternNumerals,
  translate,
} from "./i18n";
import { isRibaSource, spendableIncome, summarisePurification, term, termTable } from "./finance-mode";

describe("numerals", () => {
  it("transliterates digits and leaves separators alone", () => {
    expect(toBengaliNumerals("1,23,456")).toBe("১,২৩,৪৫৬");
    expect(toBengaliNumerals("৳1,000")).toBe("৳১,০০০");
  });

  it("round-trips", () => {
    expect(toWesternNumerals(toBengaliNumerals("9876543210"))).toBe("9876543210");
  });

  it("applyNumerals is a no-op for WESTERN", () => {
    expect(applyNumerals("1,234", "WESTERN")).toBe("1,234");
    expect(applyNumerals("1,234", "BENGALI")).toBe("১,২৩৪");
  });
});

describe("translate", () => {
  it("returns Bangla when available", () => {
    expect(translate("nav.dashboard", "BN")).toBe("ড্যাশবোর্ড");
    expect(translate("nav.dashboard", "EN")).toBe("Dashboard");
  });

  it("has a Bangla string for every key", () => {
    for (const [key, entry] of Object.entries(MESSAGES)) {
      expect(entry.en, `${key} missing en`).toBeTruthy();
      expect(entry.bn, `${key} missing bn`).toBeTruthy();
    }
  });
});

describe("createFormatter", () => {
  it("groups in the lakh/crore pattern", () => {
    const f = createFormatter("EN", "WESTERN");
    expect(f.money(1234567)).toBe("৳12,34,567");
  });

  it("keeps Western digits in Bangla when numerals are WESTERN", () => {
    const f = createFormatter("BN", "WESTERN");
    expect(f.money(1234567)).toBe("৳12,34,567");
  });

  it("uses Bengali digits when asked, in either language", () => {
    expect(createFormatter("EN", "BENGALI").money(1234567)).toBe("৳১২,৩৪,৫৬৭");
    expect(createFormatter("BN", "BENGALI").money(1234567)).toBe("৳১২,৩৪,৫৬৭");
  });

  it("handles negatives and non-finite input", () => {
    const f = createFormatter("EN", "WESTERN");
    expect(f.money(-5000)).toBe("-৳5,000");
    expect(f.money(Number.NaN)).toBe("৳0");
  });

  it("normalises date digits to the configured numeral system", () => {
    const date = new Date(Date.UTC(2026, 6, 31));
    expect(createFormatter("BN", "WESTERN").date(date)).toMatch(/[0-9]/);
    expect(createFormatter("BN", "WESTERN").date(date)).not.toMatch(/[০-৯]/);
    expect(createFormatter("EN", "BENGALI").date(date)).not.toMatch(/[0-9]/);
  });
});

describe("finance mode vocabulary", () => {
  it("relabels interest as profit in Islamic mode", () => {
    expect(term("interest", "CONVENTIONAL")).toBe("Interest");
    expect(term("interest", "ISLAMIC")).toBe("Profit");
    expect(term("fixedDeposit", "ISLAMIC")).toBe("Mudaraba term deposit");
    expect(term("insurance", "ISLAMIC")).toBe("Takaful");
  });

  it("termTable pairs each label with its counterpart", () => {
    const table = termTable("ISLAMIC");
    const interest = table.find((r) => r.key === "interest")!;
    expect(interest.label).toBe("Profit");
    expect(interest.other).toBe("Interest");
  });
});

describe("riba purification", () => {
  it("recognises the default riba sources", () => {
    expect(isRibaSource("BANK_INTEREST")).toBe(true);
    expect(isRibaSource("SAVINGS_CERTIFICATE")).toBe(true);
    expect(isRibaSource("SALARY")).toBe(false);
  });

  it("tracks what is still owed to charity", () => {
    expect(summarisePurification(10000, 4000)).toEqual({
      ribaIncome: 10000,
      purified: 4000,
      outstanding: 6000,
    });
  });

  it("never reports negative outstanding after over-giving", () => {
    expect(summarisePurification(1000, 5000).outstanding).toBe(0);
  });

  it("excludes riba from spendable income only in Islamic mode", () => {
    expect(spendableIncome(100000, 8000, "ISLAMIC")).toBe(92000);
    expect(spendableIncome(100000, 8000, "CONVENTIONAL")).toBe(100000);
  });
});

describe("localiseAmountsInText", () => {
  const fmt = createFormatter("EN", "WESTERN");

  it("regroups Western-formatted amounts in lakh style", () => {
    expect(localiseAmountsInText("Wealth reaches BDT 6,000,000", fmt.money)).toBe("Wealth reaches ৳60,00,000");
    expect(localiseAmountsInText("SP at Tk 500000", fmt.money)).toBe("SP at ৳5,00,000");
  });

  it("follows the numeral setting", () => {
    const bn = createFormatter("EN", "BENGALI");
    expect(localiseAmountsInText("BDT 500,000", bn.money)).toBe("৳৫,০০,০০০");
  });

  it("leaves text without amounts alone", () => {
    expect(localiseAmountsInText("Emergency fund", fmt.money)).toBe("Emergency fund");
  });
});

describe("display formats", () => {
  const d = new Date(Date.UTC(2026, 8, 26));

  it("formats a day as 26 Sep 2026", () => {
    expect(createFormatter("EN", "WESTERN").day(d)).toBe("26 Sep 2026");
    expect(createFormatter("EN", "BENGALI").day(d)).toBe("২৬ Sep ২০২৬");
    expect(createFormatter("EN", "WESTERN").monthYear(d)).toBe("Sep 2026");
  });

  it("abbreviates money in lakh/crore units", () => {
    const fmt = createFormatter("EN", "WESTERN");
    expect(fmt.compactMoney(950)).toBe("৳950");
    expect(fmt.compactMoney(50000)).toBe("৳50K");
    expect(fmt.compactMoney(120000)).toBe("৳1.2L");
    expect(fmt.compactMoney(1500000)).toBe("৳15L");
    expect(fmt.compactMoney(-35000000)).toBe("-৳3.5Cr");
  });
});
