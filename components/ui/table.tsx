"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Table({
  className,
  responsive = false,
  maxHeight,
  ...props
}: React.ComponentProps<"table"> & {
  /** Below 640px, lay rows out as stacked cards (cells need a `label`). */
  responsive?: boolean
  /** Scroll inside the table past this height, keeping the header row pinned. */
  maxHeight?: string
}) {
  return (
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-x-auto", maxHeight && "overflow-y-auto")}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table
        data-slot="table"
        data-responsive={responsive || undefined}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "sticky top-0 z-10 h-10 bg-card px-2 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  label,
  primary,
  actions,
  empty,
  ...props
}: React.ComponentProps<"td"> & {
  /** Column name shown beside the value when a responsive table stacks on mobile. */
  label?: string
  /** The row's title cell: shown as the stacked card's heading. */
  primary?: boolean
  /** The row's action cell: pinned to the bottom-right of the stacked card. */
  actions?: boolean
  /** An empty-state cell spanning the table. */
  empty?: boolean
}) {
  return (
    <td
      data-slot="table-cell"
      data-label={label}
      data-primary={primary || undefined}
      data-actions={actions || undefined}
      data-empty={empty || undefined}
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
