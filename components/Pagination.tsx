import Link from "next/link";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";

export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  extraParams,
  pageParam = "page",
  pageSizeParam = "pageSize",
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
  /** Override the query-param names — needed when multiple paginated tables share one page/tab. */
  pageParam?: string;
  pageSizeParam?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const from = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const to = Math.min(clampedPage * pageSize, total);

  function hrefFor(targetPage: number, targetPageSize = pageSize): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(extraParams ?? {})) {
      if (value) params.set(key, value);
    }
    params.set(pageParam, String(targetPage));
    params.set(pageSizeParam, String(targetPageSize));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm" style={{ color: "var(--muted)" }}>
      <span>
        {from}-{to} of {total}
      </span>
      <div className="flex items-center gap-3">
        <form action={basePath}>
          {Object.entries(extraParams ?? {}).map(
            ([key, value]) => value && <input key={key} type="hidden" name={key} value={value} />,
          )}
          <input type="hidden" name={pageParam} value="1" />
          <AutoSubmitSelect
            name={pageSizeParam}
            defaultValue={String(pageSize)}
            options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} / page` }))}
          />
        </form>
        <span>
          Page {clampedPage} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Link href={hrefFor(1)} aria-disabled={clampedPage <= 1} className={`btn-ghost !px-1.5 ${clampedPage <= 1 && "pointer-events-none opacity-30"}`}>
            <ChevronsLeft size={15} />
          </Link>
          <Link
            href={hrefFor(clampedPage - 1)}
            aria-disabled={clampedPage <= 1}
            className={`btn-ghost !px-1.5 ${clampedPage <= 1 && "pointer-events-none opacity-30"}`}
          >
            <ChevronLeft size={15} />
          </Link>
          <Link
            href={hrefFor(clampedPage + 1)}
            aria-disabled={clampedPage >= totalPages}
            className={`btn-ghost !px-1.5 ${clampedPage >= totalPages && "pointer-events-none opacity-30"}`}
          >
            <ChevronRight size={15} />
          </Link>
          <Link
            href={hrefFor(totalPages)}
            aria-disabled={clampedPage >= totalPages}
            className={`btn-ghost !px-1.5 ${clampedPage >= totalPages && "pointer-events-none opacity-30"}`}
          >
            <ChevronsRight size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}
