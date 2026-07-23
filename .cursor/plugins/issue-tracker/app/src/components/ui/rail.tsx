import * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Current-hue live glow on a port — arbitrary property so Tailwind emits box-shadow, not a shadow color. */
const portGlow = "[box-shadow:var(--glow)]";

/** Work-state of a Rail port. Ready carries no hue (hollow ink outline). */
export type RailNodeState = "ready" | "in-flight" | "blocked" | "merged";

/** Edge into a node: solid = satisfied/landed hop; dashed = waiting on a dependency. */
export type RailEdge = "solid" | "dashed";

/** Port ring/fill per state — border color encodes state; the void base keeps ports hollow. */
const portStateClasses: Record<RailNodeState, string> = {
  ready: "border-[hsl(var(--ink))] bg-[hsl(var(--void))]",
  "in-flight": "border-[hsl(var(--current))] bg-[hsl(var(--current))]",
  blocked: "border-[hsl(var(--blocked))] bg-[hsl(var(--void))]",
  merged:
    "border-[hsl(var(--merged))] bg-[color-mix(in_srgb,hsl(var(--merged))_22%,hsl(var(--void)))]",
};

/** Label ink per state — in-flight lifts to current, blocked recedes to mut. */
const labelStateClasses: Record<RailNodeState, string> = {
  ready: "text-foreground",
  "in-flight": "text-[hsl(var(--current))]",
  blocked: "text-muted-foreground",
  merged: "text-foreground",
};

/** Single-spine lifecycle Rail: an ordered dependency spine of state-encoded ports. */
export function Rail({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="list"
      className={cn(
        "relative pl-[26px]",
        // the mainline spine: a 2px vertical gradient (rail-lit -> rail)
        "before:absolute before:left-[7px] before:bottom-2 before:top-2 before:w-[2px] before:rounded-[2px] before:bg-gradient-to-b before:from-[hsl(var(--rail-lit))] before:to-[hsl(var(--rail))] before:content-['']",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface RailNodeProps extends React.HTMLAttributes<HTMLDivElement> {
  state: RailNodeState;
  edge: RailEdge;
  label?: React.ReactNode;
  /** Force the current-hue glow; defaults to on for in-flight ports. */
  glow?: boolean;
}

/** A node on the Rail: a state-encoded port, the edge that feeds it, and its label. */
export function RailNode({
  state,
  edge,
  label,
  glow,
  className,
  children,
  ...props
}: RailNodeProps) {
  const showGlow = glow ?? state === "in-flight";

  return (
    <div
      role="listitem"
      className={cn("relative flex items-baseline gap-3 py-[9px]", className)}
      {...props}
    >
      {edge === "dashed" && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[-18px] top-[-6px] h-[18px] border-l-2 border-dashed border-[hsl(var(--blocked))] opacity-[.55]"
        />
      )}
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-[-23px] top-3 h-3 w-3 rounded-full border-2",
          portStateClasses[state],
          showGlow && portGlow,
        )}
      />
      {label != null && (
        <span className={cn("font-medium", labelStateClasses[state])}>
          {label}
        </span>
      )}
      {children}
    </div>
  );
}
