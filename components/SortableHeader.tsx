import Link from "next/link";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export function SortableHeader({
  label,
  column,
  currentSort,
  currentDir,
  basePath,
  extraParams,
}: {
  label: string;
  column: string;
  currentSort?: string;
  currentDir?: "asc" | "desc";
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const isActive = currentSort === column;
  const nextDir = isActive && currentDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    if (value) params.set(key, value);
  }
  params.set("sort", column);
  params.set("dir", nextDir);

  return (
    <Link href={`${basePath}?${params.toString()}`} className="th-sortable">
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ChevronUp size={13} style={{ color: "var(--accent)" }} />
        ) : (
          <ChevronDown size={13} style={{ color: "var(--accent)" }} />
        )
      ) : (
        <ChevronsUpDown size={13} style={{ color: "var(--muted)" }} />
      )}
    </Link>
  );
}
