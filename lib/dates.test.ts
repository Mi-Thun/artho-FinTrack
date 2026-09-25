import { describe, expect, it } from "vitest";
import { thisMonthInputValue, todayInputValue } from "./dates";

describe("todayInputValue", () => {
  it("uses the Dhaka calendar day, not the UTC one", () => {
    // 20:30 UTC on 25 Sep is 02:30 on 26 Sep in Dhaka (UTC+6).
    const lateUtc = new Date("2026-09-25T20:30:00Z");
    expect(todayInputValue(lateUtc, "Asia/Dhaka")).toBe("2026-09-26");
    expect(todayInputValue(lateUtc, "UTC")).toBe("2026-09-25");
  });

  it("gives the month in the same zone", () => {
    const lateUtc = new Date("2026-09-30T19:00:00Z");
    expect(thisMonthInputValue(lateUtc, "Asia/Dhaka")).toBe("2026-10");
  });
});
