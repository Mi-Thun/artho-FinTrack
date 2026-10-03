import { RouteLoading } from "@/components/RouteLoading";
import { CardSkeleton, HeaderSkeleton, StatRowSkeleton } from "@/components/PageSkeleton";

export default function DashboardLoading() {
  return (
    <RouteLoading>
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
        <HeaderSkeleton withPicker />
        <StatRowSkeleton />
        <StatRowSkeleton count={6} className="grid-cols-2 md:grid-cols-3 xl:grid-cols-6" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CardSkeleton chart />
          <CardSkeleton chart />
        </div>
      </div>
    </RouteLoading>
  );
}
