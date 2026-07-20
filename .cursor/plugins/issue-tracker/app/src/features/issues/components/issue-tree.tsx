import { Fragment } from "react";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  FolderKanban,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  Lightbulb,
  Plus,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  CHILD_KIND,
  type DerivedState,
  type IssueKind,
  type IssueRecord,
} from "@server/schemas";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StoryTreeDnDProvider,
  useStoryTreeDnD,
  useStoryTreeDnDContext,
} from "../hooks/use-story-tree-dnd";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import type { IssueNode } from "../lib/build-tree";
import { issuePath } from "../lib/links";
import { ArchiveIssueButton } from "./archive-issue-button";
import { AxisChip } from "./axis-chip";
import { EpicAxisChips, StoryAxisChips } from "./axis-chips";
import { TaskStatusChips } from "./task-status-chips";
import { IssueBadges } from "./issue-badges";

const KIND_ICON: Record<IssueKind, typeof Layers> = {
  project: FolderKanban,
  epic: Layers,
  idea: Lightbulb,
  story: GitBranch,
  task: GitCommitHorizontal,
};

function PrLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={url}
      className="text-muted-foreground hover:text-foreground"
      onClick={(e) => e.stopPropagation()}
    >
      <GitPullRequest className="h-3.5 w-3.5" />
    </a>
  );
}

function TreeRowDerivedMeta({
  issue,
  derived,
}: {
  issue: IssueRecord;
  derived?: DerivedState;
}) {
  if (issue.kind === "story") {
    return (
      <StoryAxisChips
        storyStatus={derived?.storyStatus}
        specReview={issue.specReview}
      />
    );
  }
  if (issue.kind === "epic") {
    return (
      <EpicAxisChips epicStatus={derived?.epicStatus} retro={issue.retro} />
    );
  }
  if (issue.kind === "task" && issue.commitSha) {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {issue.commitSha.slice(0, 7)}
      </span>
    );
  }
  return null;
}

function RowActions({ issue }: { issue: IssueRecord }) {
  const openNew = useIssueUiStore((s) => s.openNew);
  const requestDelete = useIssueUiStore((s) => s.requestDelete);
  const childKind = CHILD_KIND[issue.kind];

  return (
    <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {childKind ? (
        issue.kind === "story" ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Add child"
                onClick={(e) => e.stopPropagation()}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openNew({ presetKind: "task", presetParent: issue.id });
                }}
              >
                Add task
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openNew({
                    presetKind: "story",
                    presetParent: issue.partOf,
                    presetStackedOn: issue.id,
                  });
                }}
              >
                Add stacked story
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            title={`Add ${childKind}`}
            onClick={(e) => {
              e.stopPropagation();
              openNew({ presetKind: childKind, presetParent: issue.id });
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )
      ) : null}
      <ArchiveIssueButton issue={issue} compact />
      <Button
        variant="ghost"
        size="icon-sm"
        title="Delete"
        onClick={(e) => {
          e.stopPropagation();
          requestDelete(issue.id);
        }}
      >
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </span>
  );
}

type DerivedMap = Record<string, DerivedState>;

function TreeRow({
  node,
  derived,
}: {
  node: IssueNode;
  derived: DerivedMap;
}) {
  const { projectId = "" } = useParams();
  const { issue } = node;
  const expanded = useIssueUiStore((s) => s.expanded[issue.id] ?? true);
  const toggle = useIssueUiStore((s) => s.toggle);
  const { getRowDnDProps, consumeDragGesture } = useStoryTreeDnDContext();
  const hasChildren = node.children.length > 0;
  const Icon = KIND_ICON[issue.kind];
  const state = derived[issue.id];
  const isStory = issue.kind === "story";
  const { isDragging, isDropTarget, ...rowDnDHandlers } = getRowDnDProps(issue);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent",
          hasChildren && "cursor-pointer",
          isStory && "cursor-grab active:cursor-grabbing",
          state?.blocked && "opacity-40",
          isDragging && "opacity-50",
          isDropTarget && "bg-accent ring-1 ring-ring",
        )}
        {...rowDnDHandlers}
        onClick={
          hasChildren
            ? () => {
                if (consumeDragGesture()) return;
                toggle(issue.id);
              }
            : undefined
        }
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : null}
        </span>
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Link
          to={issuePath(projectId, issue.id)}
          className="truncate text-sm hover:underline"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        >
          {issue.title}
        </Link>
        <span className="ml-auto flex items-center gap-2">
          {state?.blocked ? (
            <AxisChip className="text-muted-foreground">blocked</AxisChip>
          ) : null}
          <IssueBadges issue={issue} compact />
          {issue.kind === "story" && issue.prUrl ? (
            <PrLink url={issue.prUrl} />
          ) : null}
          <TreeRowDerivedMeta issue={issue} derived={state} />
          {issue.kind === "task" ? (
            <TaskStatusChips status={issue.status} qa={issue.qa} />
          ) : null}
          <RowActions issue={issue} />
        </span>
      </div>
      {hasChildren && expanded ? (
        <div className="ml-4 border-l border-border/60 pl-2">
          {node.children.map((child) => (
            <TreeRow key={child.issue.id} node={child} derived={derived} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function IssueTree({
  nodes,
  derived,
  issues,
}: {
  nodes: IssueNode[];
  derived: DerivedMap;
  issues: IssueRecord[];
}) {
  const dnd = useStoryTreeDnD(issues);

  if (nodes.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-sm text-muted-foreground">
        No issues yet.
      </p>
    );
  }
  return (
    <StoryTreeDnDProvider value={dnd}>
      <div className="flex flex-col">
        {nodes.map((node, index) => (
          <Fragment key={node.issue.id}>
            {index > 0 ? <Separator className="my-3" /> : null}
            <TreeRow node={node} derived={derived} />
          </Fragment>
        ))}
      </div>
    </StoryTreeDnDProvider>
  );
}
