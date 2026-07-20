import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function AxisChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </span>
  );
}
