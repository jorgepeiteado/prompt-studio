import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/** Skeleton loading placeholder (gallery lazy images). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/40", className)}
      aria-hidden="true"
      {...props}
    />
  );
}