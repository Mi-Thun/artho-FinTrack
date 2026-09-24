"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginUser, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginUser, initialState);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <Logo size="lg" className="mb-6" />

      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-1 text-xl font-bold tracking-tight">Welcome back</h1>
        <p className="mb-6 text-sm text-muted-foreground">Log in to see your finances.</p>
        <form action={formAction} className="flex flex-col gap-4">
          <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
            Email
            <Input name="email" type="email" required />
          </Label>
          <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
            Password
            <Input name="password" type="password" required />
          </Label>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" disabled={pending} className="mt-1 w-full">
            {pending ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </Card>
      <p className="mt-5 text-sm text-muted-foreground">
        No account?{" "}
        <Link href="/register" className="font-medium text-primary hover:opacity-80">
          Register
        </Link>
      </p>
    </main>
  );
}
