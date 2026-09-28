import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import type { ReactNode } from "react";
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PAGE_SIZES } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { Pagination as UiPagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";

export async function Pagination({
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
  // One page of rows needs no pager. (The smallest page size is the default, 10, so a list
  // that fits in the current size never needs the size picker either.)
  if (total <= pageSize && page <= 1) return null;

  // Counts follow the user's numeral setting like every other figure on the page.
  const { fmt } = await getLocalisation(await requireUserId());
  const n = (value: number) => fmt.number(value);

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

  const onFirst = clampedPage <= 1;
  const onLast = clampedPage >= totalPages;
  const arrow = (target: number, label: string, disabled: boolean, icon: ReactNode, wideOnly = false) => (
    <PaginationItem className={wideOnly ? "hidden sm:list-item" : undefined}>
      <PaginationLink
        href={hrefFor(target)}
        aria-label={label}
        aria-disabled={disabled}
        className={cn("size-8", disabled && "pointer-events-none opacity-30")}
      >
        {icon}
      </PaginationLink>
    </PaginationItem>
  );

  // Two groups on one line, a phone included: what's showing (and how many per page) on
  // the left, where you are and the way to move on the right.
  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground sm:gap-3 sm:text-sm">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <span className="whitespace-nowrap tabular-nums">
          {n(from)}–{n(to)} of {n(total)}
        </span>
        <form action={basePath}>
          {Object.entries(extraParams ?? {}).map(
            ([key, value]) => value && <input key={key} type="hidden" name={key} value={value} />,
          )}
          <input type="hidden" name={pageParam} value="1" />
          <AutoSubmitSelect
            name={pageSizeParam}
            ariaLabel="Rows per page"
            defaultValue={String(pageSize)}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: `${fmt.number(size)} / page` }))}
            // Sized to its label rather than the default 9rem, so the pager stays one line on a phone.
            className="h-8 min-w-0 gap-1 px-2.5 text-xs sm:text-sm"
          />
        </form>
      </div>
      <UiPagination className="mx-0 w-auto shrink-0">
        <PaginationContent className="gap-1">
          {arrow(1, "First page", onFirst, <ChevronsLeft size={15} />, true)}
          {arrow(clampedPage - 1, "Previous page", onFirst, <ChevronLeft size={15} />)}
          <PaginationItem>
            <span className="px-2 whitespace-nowrap tabular-nums" aria-current="page">
              <span className="font-medium text-foreground">{n(clampedPage)}</span> / {n(totalPages)}
            </span>
          </PaginationItem>
          {arrow(clampedPage + 1, "Next page", onLast, <ChevronRight size={15} />)}
          {arrow(totalPages, "Last page", onLast, <ChevronsRight size={15} />, true)}
        </PaginationContent>
      </UiPagination>
    </div>
  );
}
