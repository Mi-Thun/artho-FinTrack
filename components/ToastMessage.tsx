"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ToastMessage({ message, tone = "success" }: { message: string; tone?: "success" | "error" }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const colors = tone === "success"
    ? "border-[var(--status-success)] bg-[var(--status-success-soft)]"
    : "border-[var(--status-danger)] bg-[var(--status-danger-soft)]";

  return (
    <div
      role="status"
      className={`fixed top-4 right-4 z-[100] flex max-w-sm items-center gap-3 rounded-lg border-l-4 px-4 py-3 text-sm text-foreground shadow-lg ${colors}`}
    >
      <span>{message}</span>
      <Button type="button" variant="ghost" size="icon-sm" className="ml-auto shrink-0" onClick={() => setVisible(false)} aria-label="Dismiss notification">
        <X size={15} />
      </Button>
    </div>
  );
}
