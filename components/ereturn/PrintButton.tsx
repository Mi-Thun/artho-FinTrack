"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog — "Save as PDF" there gives a PDF of the return. */
export function PrintButton() {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer size={15} />
      Print or save as PDF
    </Button>
  );
}
