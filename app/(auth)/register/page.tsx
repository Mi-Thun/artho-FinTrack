"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerUser, type RegisterState } from "./actions";

const initialState: RegisterState = {};

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerUser, initialState);

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
          A
        </div>
        <span className="text-lg font-semibold">Artho</span>
      </div>

      <div className="card w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold tracking-tight">Create an account</h1>
        <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
          Start tracking your finances.
        </p>
        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <input name="name" type="text" className="input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input name="email" type="email" required className="input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Password
            <input name="password" type="password" required minLength={8} className="input" />
          </label>
          {state.error && <p className="text-sm text-rose-600">{state.error}</p>}
          <button type="submit" disabled={pending} className="btn-primary mt-1 w-full">
            {pending ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
      <p className="mt-5 text-sm" style={{ color: "var(--muted)" }}>
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
          Log in
        </Link>
      </p>
    </main>
  );
}
