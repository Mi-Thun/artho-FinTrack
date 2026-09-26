import { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SubNav } from "@/components/SubNav";

const TABS = [
  { href: "/goals", label: "Projection" },
  { href: "/goals/plan", label: "Plan" },
  { href: "/goals/salary", label: "Salary plan" },
  { href: "/goals/milestones", label: "Milestones" },
];

/** Goals & projection: one header, with the plan's inputs as tabs rather than dialogs. */
export default function GoalsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals & projection"
      >
        <SubNav items={TABS} label="Goals sections" />
      </PageHeader>
      {children}
    </div>
  );
}
