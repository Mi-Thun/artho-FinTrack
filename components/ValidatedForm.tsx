"use client";

import { FormEvent, ReactNode, useRef } from "react";

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function errorSlot(control: Element): HTMLElement | null {
  return control.closest("[data-field]")?.querySelector<HTMLElement>("[data-field-error]") ?? null;
}

function setError(control: Control, message: string) {
  const slot = errorSlot(control);
  if (slot) slot.textContent = message;
  if (message) control.setAttribute("aria-invalid", "true");
  else control.removeAttribute("aria-invalid");
}

/**
 * A form that shows validation messages inline, under the field they belong to, instead
 * of the browser's floating bubble — which only ever shows one error, vanishes on
 * scroll, and can't be styled. It uses the fields' own constraints (`required`, `min`,
 * `pattern`, MoneyInput's custom validity), so server actions are untouched.
 *
 * Messages land in the `[data-field-error]` slot every `Field` renders; the first invalid
 * field gets focus.
 */
export function ValidatedForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  children: ReactNode;
}) {
  const focusQueued = useRef(false);

  return (
    <form
      action={action}
      className={className}
      onInvalidCapture={(e: FormEvent<HTMLFormElement>) => {
        const control = e.target as Control;
        e.preventDefault();
        setError(control, control.validationMessage);
        if (!focusQueued.current) {
          // `invalid` fires once per bad field; focus only the first of the batch.
          focusQueued.current = true;
          queueMicrotask(() => {
            focusQueued.current = false;
            control.form?.querySelector<Control>("[aria-invalid=true]")?.focus();
          });
        }
      }}
      onInputCapture={(e: FormEvent<HTMLFormElement>) => {
        const control = e.target as Control;
        if (control.getAttribute?.("aria-invalid") && control.checkValidity?.()) setError(control, "");
      }}
    >
      {children}
    </form>
  );
}
