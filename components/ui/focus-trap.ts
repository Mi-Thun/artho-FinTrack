import type { KeyboardEvent } from "react"

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps Tab / Shift+Tab cycling inside a modal popup. Base UI's own focus guards were
 * observed letting focus fall through to <body> and on into the page behind (every dialog,
 * after its last control), so modal popups wrap focus themselves at the two ends.
 */
export function trapTabKey(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab" || event.defaultPrevented) return
  const root = event.currentTarget
  const items = [...root.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => el.getClientRects().length > 0 && !el.closest("[inert]")
  )
  if (items.length === 0) return
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
