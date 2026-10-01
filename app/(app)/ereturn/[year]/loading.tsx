import { CardSkeleton, StatRowSkeleton } from "@/components/PageSkeleton";

// Renders under the return's layout, so the header and tabs stay put while a tab loads.
export default function ReturnLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <StatRowSkeleton />
      <CardSkeleton rows={8} />
    </div>
  );
}
