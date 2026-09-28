"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface HeaderMenuItem {
  label: string;
  href: string;
  icon?: ReactNode;
  /** A file download (e.g. CSV export) rather than a page: rendered as a plain <a>. */
  download?: boolean;
}

/** The "⋯" menu holding a page's secondary actions. */
export function HeaderMenu({ items, label = "More actions" }: { items: HeaderMenuItem[]; label?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label={label} title={label} />}>
        <MoreHorizontal size={16} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            render={item.download ? <a href={item.href} download /> : <Link href={item.href} />}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
