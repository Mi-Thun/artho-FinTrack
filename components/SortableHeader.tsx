import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export function SortableHeader({
  label,
  column,
  currentSort,
  currentDir,
  basePath,
  extraParams,
  sortParam = "sort",
  dirParam = "dir",
}: {
  label: string;
  column: string;
  currentSort?: string;
  currentDir?: "asc" | "desc";
  basePath: string;
  extraParams?: Record<string, string | undefined>;
  /** Override the query-param names — needed when several sortable tables share one page. */
  sortParam?: string;
  dirParam?: string;
}) {
  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    if (value) params.set(key, value);
  }
  params.set(sortParam, column);
  params.set(dirParam, nextDir);

  return (
    <Link
      href={`${basePath}?${params.toString()}`}
      className="-mx-1 inline-flex select-none items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-muted"
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ChevronUp size={13} className="text-primary" />
        ) : (
          <ChevronDown size={13} className="text-primary" />
        )
      ) : (
        <ChevronsUpDown size={13} className="text-muted-foreground" />
      )}
    </Link>
  );
}
