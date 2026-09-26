"use client";

import { useActionState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { setPin, type PinState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/Field";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export function PinForm({ hasPin, clearAction }: { hasPin: boolean; clearAction: () => void }) {
  const [state, formAction, pending] = useActionState<PinState, FormData>(setPin, {});

  return (
    <div className="flex flex-col gap-4">
      {hasPin && (
        <p className="text-sm">
          <span className="font-medium text-success">A PIN is set.</span> Entering a new one below
          replaces it.
        </p>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Field label={hasPin ? "New PIN" : "PIN"} required>
          <Input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4,8}"
            placeholder="4–8 digits"
            required
            className="w-40"
          />
        </Field>
        <Field label="Confirm PIN" required>
          <Input
            name="confirmPin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4,8}"
            required
            className="w-40"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          <Lock size={14} />
          {pending ? "Saving…" : hasPin ? "Replace PIN" : "Set PIN"}
        </Button>
        {hasPin && (
          <ConfirmDialog
            action={() => clearAction()}
            title="Remove the app PIN?"
            description="The app will open straight to your dashboard after sign-in."
            confirmLabel="Remove PIN"
            successMessage="App PIN removed"
            triggerLabel="Remove PIN"
            triggerIcon={<Trash2 size={14} />}
            triggerVariant="secondary"
          />
        )}
      </form>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.success && <p className="text-sm text-success">{state.success}</p>}
    </div>
  );
}
