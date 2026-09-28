import { Skeleton } from "@/components/Skeleton";

/** Building blocks for route loading screens, shaped like the real layout. */

export function HeaderSkeleton({ withPicker = false }: { withPicker?: boolean }) {
  return (
    <div className="flex flex-col gap-4 border-b pb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-36 rounded-lg" />
      </div>
      {withPicker && <Skeleton className="h-8 w-52 rounded-lg" />}
    </div>
  );
}

export function StatRowSkeleton({ count = 4, className = "grid-cols-2 xl:grid-cols-4" }: { count?: number; className?: string }) {
  return (
    <div className={`grid gap-3 sm:gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl bg-card p-card-pad ring-1 ring-foreground/10">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-6 w-32" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ rows = 6, chart = false }: { rows?: number; chart?: boolean }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-card p-card-pad ring-1 ring-foreground/10">
      <Skeleton className="h-5 w-40" />
      {chart ? (
        <Skeleton className="h-56 w-full rounded-lg" />
      ) : (
        Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-4" style={{ width: `${92 - i * 5}%` }} />)
      )}
    </div>
  );
}
