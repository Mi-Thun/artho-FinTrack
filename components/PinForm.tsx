"use client";

import { useActionState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { setPin, type PinState } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PinForm({ hasPin, clearAction }: { hasPin: boolean; clearAction: () => void }) {
  const [state, formAction, pending] = useActionState<PinState, FormData>(setPin, {});

  return (
    <div className="flex flex-col gap-4">
      {hasPin && (
        <p className="text-sm">
          <span className="font-medium text-[var(--status-success)]">A PIN is set.</span> Entering a new one below
          replaces it.
        </p>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          {hasPin ? "New PIN" : "PIN"}
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
        </Label>
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          Confirm
          <Input
            name="confirmPin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            pattern="\d{4,8}"
            required
            className="w-40"
          />
        </Label>
        <Button type="submit" disabled={pending}>
          <Lock size={14} />
          {pending ? "Saving…" : hasPin ? "Replace PIN" : "Set PIN"}
        </Button>
        {hasPin && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              if (confirm("Remove the app PIN? The app will open straight to your dashboard after sign-in.")) {
                clearAction();
              }
            }}
          >
            <Trash2 size={14} />
            Remove
          </Button>
        )}
      </form>

      {state.error && <p className="text-sm text-[var(--status-danger)]">{state.error}</p>}
      {state.success && <p className="text-sm text-[var(--status-success)]">{state.success}</p>}
    </div>
  );
}
