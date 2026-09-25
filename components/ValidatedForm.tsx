"use client";

import { ReactNode, useEffect, useRef } from "react";

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
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let focusQueued = false;

    // `invalid` doesn't bubble, and React only listens for it on the element that has
    // the handler — so a form-level React `onInvalid` never sees its fields' events. A
    // native capture-phase listener on the form does.
    const onInvalid = (e: Event) => {
      const control = e.target as Control;
      e.preventDefault();
      setError(control, control.validationMessage);
      if (!focusQueued) {
        // `invalid` fires once per bad field; focus only the first of the batch.
        focusQueued = true;
        queueMicrotask(() => {
          focusQueued = false;
          form.querySelector<Control>("[aria-invalid=true]")?.focus();
        });
      }
    };
    const onInput = (e: Event) => {
      const control = e.target as Control;
      if (control.getAttribute?.("aria-invalid") && control.checkValidity?.()) setError(control, "");
    };

    form.addEventListener("invalid", onInvalid, true);
    form.addEventListener("input", onInput, true);
    return () => {
      form.removeEventListener("invalid", onInvalid, true);
      form.removeEventListener("input", onInput, true);
    };
  }, []);

  return (
    <form ref={formRef} action={action} className={className}>
      {children}
    </form>
  );
}
