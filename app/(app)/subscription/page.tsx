import { CreditCard } from "lucide-react";
import { Card } from "@/components/Card";

export default function SubscriptionPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Subscription
      </h1>
      <Card title="Current Plan" icon={<CreditCard size={16} />}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          You're on the Free plan. Subscription management is coming soon.
        </p>
      </Card>
    </div>
  );
}
