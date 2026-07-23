import { useMemo } from "react";
import { useMatch } from "react-router-dom";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { currentGlow, liveChip } from "@/components/ui/overlay-surfaces";
import { cn } from "@/lib/utils/cn";
import { useIssuesQuery } from "../api/queries";
import { filterToProject } from "../lib/build-tree";
import { hasInFlightWork } from "../lib/derived";

export function TopBar() {
  // TopBar sits above <Routes>, so useMatch (not useParams) for project scope.
  const detailMatch = useMatch("/projects/:projectId/issues/:id");
  const projectMatch = useMatch("/projects/:projectId");
  const projectId =
    detailMatch?.params.projectId ?? projectMatch?.params.projectId;
  const { data } = useIssuesQuery();

  const live = useMemo(() => {
    const issues = filterToProject(data?.issues ?? [], projectId ?? null);
    return hasInFlightWork(issues, data?.derived ?? {});
  }, [data?.derived, data?.issues, projectId]);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
      <span
        className={liveChip}
        data-live={live ? "true" : "false"}
        aria-live="polite"
      >
        <span
          aria-hidden
          className={cn(
            "h-[7px] w-[7px] shrink-0 rounded-full",
            live
              ? cn(
                  "bg-[hsl(var(--current))] motion-safe:animate-live-dot",
                  currentGlow,
                )
              : "bg-[hsl(var(--rail-lit))]",
          )}
        />
        {live ? "agents on the line" : "all quiet"}
      </span>
      <ThemeToggle />
    </header>
  );
}
