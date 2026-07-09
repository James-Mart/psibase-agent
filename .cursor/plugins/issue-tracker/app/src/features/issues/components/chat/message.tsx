import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type MessageAlign = "start" | "end";

export function Message({
  align,
  children,
}: {
  align: MessageAlign;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex w-full",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {children}
    </div>
  );
}

export function Bubble({
  align,
  author,
  at,
  children,
}: {
  align: MessageAlign;
  author: string;
  at: string;
  children: ReactNode;
}) {
  const time = formatTime(at);
  return (
    <div
      className={cn(
        "max-w-[85%] rounded-lg border px-3 py-2",
        align === "end"
          ? "border-primary/30 bg-primary/10"
          : "border-border bg-muted/40",
      )}
    >
      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/80">{author}</span>
        {time ? <time dateTime={at}>{time}</time> : null}
      </div>
      {children}
    </div>
  );
}

function formatTime(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
