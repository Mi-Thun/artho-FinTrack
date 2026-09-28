import { CardSkeleton, HeaderSkeleton, StatRowSkeleton } from "@/components/PageSkeleton";

export default function TransactionsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading transactions">
      <HeaderSkeleton withPicker />
      <StatRowSkeleton count={3} className="grid-cols-3" />
      <CardSkeleton rows={10} />
    </div>
  );
}
