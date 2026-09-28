/** Rows-per-page choices offered under every paginated table. */
export const PAGE_SIZES = [10, 25, 50, 100];

/** Rows shown when the URL doesn't ask for a size. */
export const DEFAULT_PAGE_SIZE = 10;

/** A page size from a query param, or the default if it's missing or not on offer. */
export function pageSizeFrom(value: string | undefined): number {
  const size = Number(value);
  return PAGE_SIZES.includes(size) ? size : DEFAULT_PAGE_SIZE;
}
