"use client";

// Popups that can sit inside a dialog: select lists, menus, popovers (InfoHint).
const OPEN_NESTED_POPUP =
  '[data-slot="select-content"][data-open], [data-slot="dropdown-menu-content"][data-open], [data-slot="popover-content"][data-open]';

/**
 * Whether a dialog/sheet should ignore this close request. Escape pressed while a select
 * list (or menu, or popover) inside the form is open is meant for that popup — but the
 * dialog hears it too, and closing the whole form there throws away what was typed.
 */
export function isDismissForNestedPopup(details: { reason?: string } | undefined): boolean {
  return details?.reason === "escape-key" && document.querySelector(OPEN_NESTED_POPUP) != null;
}
