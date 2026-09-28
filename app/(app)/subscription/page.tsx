import { Check, CreditCard } from "lucide-react";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";

const FREE_FEATURES = [
  "Unlimited accounts and transactions",
  "Budgets, recurring transactions and CSV import/export",
  "Sanchayapatra and DPS tracking with tax",
  "Savings projection and milestones",
  "Household sharing",
  "Bangla numerals and Islamic finance wording",
];

export default function SubscriptionPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Subscription" />
      <Card
        title="Free plan"
        icon={<CreditCard size={16} />}
        action={<span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">Current plan</span>}
      >
        <ul className="flex flex-col gap-2 text-sm">
          {FREE_FEATURES.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-muted-foreground">Paid plans are coming soon. Everything above stays free.</p>
      </Card>
    </div>
  );
}
