import { ZERO, money, toNumber } from "@/lib/money";
import { fromHijri, toHijri } from "@/lib/hijri";

// Savings goals, with templates for the things Bangladeshi households actually save
// for. Generic goal tracking is commodity; templates that know Qurbani lands on 10
// Dhul-Hijjah and that a Hajj package is quoted in lakh are what make it feel local.

export interface GoalTemplate {
  key: string;
  name: string;
  nameBn: string;
  /** Rough starting target in BDT — a prompt, not a prescription. */
  suggestedAmount: number;
  /** For observance-linked goals, the Hijri month/day the money is needed by. */
  hijriDeadline?: { month: number; day: number };
  /** For life goals, a sensible default horizon. */
  defaultMonths?: number;
  blurb: string;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    key: "QURBANI",
    name: "Qurbani",
    nameBn: "কোরবানি",
    suggestedAmount: 90000,
    hijriDeadline: { month: 12, day: 10 },
    blurb: "Animal prices climb sharply in the last fortnight — save monthly instead.",
  },
  {
    key: "EID_UL_FITR",
    name: "Eid-ul-Fitr",
    nameBn: "ঈদুল ফিতর",
    suggestedAmount: 50000,
    hijriDeadline: { month: 10, day: 1 },
    blurb: "Clothing, salami, travel home, and the Ramadan grocery bill before it.",
  },
  {
    key: "RAMADAN",
    name: "Ramadan groceries",
    nameBn: "রমজানের বাজার",
    suggestedAmount: 30000,
    hijriDeadline: { month: 9, day: 1 },
    blurb: "Iftar and sehri push a month's grocery spend well above normal.",
  },
  {
    key: "HAJJ",
    name: "Hajj fund",
    nameBn: "হজ্জ ফান্ড",
    suggestedAmount: 700000,
    defaultMonths: 60,
    blurb: "Government and private packages both run into several lakh.",
  },
  {
    key: "UMRAH",
    name: "Umrah",
    nameBn: "ওমরাহ",
    suggestedAmount: 200000,
    defaultMonths: 24,
    blurb: "Cheaper and more flexible than Hajj, and doable in a couple of years.",
  },
  {
    key: "WEDDING",
    name: "Wedding",
    nameBn: "বিয়ে",
    suggestedAmount: 800000,
    defaultMonths: 36,
    blurb: "Venue, gold, and gifts — the costs most households underestimate.",
  },
  {
    key: "FLAT_DOWNPAYMENT",
    name: "Flat down payment",
    nameBn: "ফ্ল্যাটের ডাউন পেমেন্ট",
    suggestedAmount: 2000000,
    defaultMonths: 60,
    blurb: "Usually 20–30% up front, with the rest financed.",
  },
  {
    key: "CHILD_EDUCATION",
    name: "Child's education",
    nameBn: "সন্তানের শিক্ষা",
    suggestedAmount: 1500000,
    defaultMonths: 120,
    blurb: "Private university tuition, or study abroad.",
  },
  {
    key: "EMERGENCY_FUND",
    name: "Emergency fund",
    nameBn: "জরুরি তহবিল",
    suggestedAmount: 300000,
    defaultMonths: 18,
    blurb: "Six months of expenses, kept liquid rather than locked in a certificate.",
  },
  {
    key: "CAR",
    name: "Car",
    nameBn: "গাড়ি",
    suggestedAmount: 2500000,
    defaultMonths: 48,
    blurb: "Remember registration, insurance, and the driver's salary on top.",
  },
];

export function goalTemplate(key: string | null | undefined): GoalTemplate | null {
  return GOAL_TEMPLATES.find((t) => t.key === key) ?? null;
}

/**
 * The date a template's goal is needed by. Observance-linked templates resolve to the
 * next occurrence of their Hijri date; life goals to a default horizon.
 */
export function suggestedTargetDate(template: GoalTemplate, from: Date): Date {
  if (template.hijriDeadline) {
    const today = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const hijriYear = toHijri(today).year;
    for (let offset = 0; offset <= 2; offset++) {
      const date = fromHijri(hijriYear + offset, template.hijriDeadline.month, template.hijriDeadline.day);
      if (date >= today) return date;
    }
  }
  const months = template.defaultMonths ?? 12;
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate()));
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface GoalInput {
  id?: string;
  name: string;
  templateKey?: string | null;
  targetAmount: unknown;
  targetDate?: Date | null;
  archivedAt?: Date | null;
  contributions: { date: Date; amount: unknown }[];
}

export interface GoalProgress {
  id?: string;
  name: string;
  templateKey: string | null;
  targetAmount: number;
  saved: number;
  remaining: number;
  progressPct: number;
  targetDate: Date | null;
  /** Whole months left, rounded up. Null when there is no target date. */
  monthsRemaining: number | null;
  /** What must be set aside each remaining month to arrive on time. */
  requiredMonthly: number | null;
  isComplete: boolean;
  isOverdue: boolean;
  isArchived: boolean;
}

function monthsUntil(from: Date, to: Date): number {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  // Part of a month still counts as a month to save in.
  return to.getUTCDate() > from.getUTCDate() ? months + 1 : months;
}

export function goalProgress(goal: GoalInput, asOf: Date): GoalProgress {
  const target = money(goal.targetAmount);
  const saved = goal.contributions.reduce((sum, c) => sum.plus(money(c.amount)), ZERO);
  const rawRemaining = target.minus(saved);
  const remaining = rawRemaining.isNegative() ? ZERO : rawRemaining;

  const targetNumber = toNumber(target);
  const savedNumber = toNumber(saved);
  const remainingNumber = toNumber(remaining);
  const isComplete = targetNumber > 0 && savedNumber >= targetNumber;

  let monthsRemaining: number | null = null;
  let requiredMonthly: number | null = null;
  if (goal.targetDate) {
    monthsRemaining = Math.max(monthsUntil(asOf, goal.targetDate), 0);
    if (!isComplete) {
      // With zero months left the whole remainder is due now, not divided by zero.
      requiredMonthly = monthsRemaining > 0 ? toNumber(remaining.dividedBy(monthsRemaining)) : remainingNumber;
    } else {
      requiredMonthly = 0;
    }
  }

  return {
    id: goal.id,
    name: goal.name,
    templateKey: goal.templateKey ?? null,
    targetAmount: targetNumber,
    saved: savedNumber,
    remaining: remainingNumber,
    progressPct: targetNumber > 0 ? Math.min((savedNumber / targetNumber) * 100, 100) : 0,
    targetDate: goal.targetDate ?? null,
    monthsRemaining,
    requiredMonthly,
    isComplete,
    isOverdue: !isComplete && goal.targetDate != null && asOf > goal.targetDate,
    isArchived: goal.archivedAt != null,
  };
}

export interface GoalsSummary {
  goals: GoalProgress[];
  totalTarget: number;
  totalSaved: number;
  /** Sum of what every active, on-track goal needs each month. */
  totalRequiredMonthly: number;
  completedCount: number;
  overdueCount: number;
}

export function summariseGoals(goals: GoalInput[], asOf: Date): GoalsSummary {
  const progress = goals.map((g) => goalProgress(g, asOf));
  const active = progress.filter((g) => !g.isArchived);

  return {
    goals: progress,
    totalTarget: active.reduce((sum, g) => sum + g.targetAmount, 0),
    totalSaved: active.reduce((sum, g) => sum + g.saved, 0),
    totalRequiredMonthly: active.reduce((sum, g) => sum + (g.requiredMonthly ?? 0), 0),
    completedCount: active.filter((g) => g.isComplete).length,
    overdueCount: active.filter((g) => g.isOverdue).length,
  };
}
