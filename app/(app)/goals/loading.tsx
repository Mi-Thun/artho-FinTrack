import { CardSkeleton } from "@/components/PageSkeleton";

// Renders under the Goals layout, so the header and tabs stay put while a tab loads.
export default function GoalsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <CardSkeleton chart />
      <CardSkeleton rows={8} />
    </div>
  );
}
