import { Fragment } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  FolderKanban,
  GitCommitHorizontal,
  GitPullRequest,
  Layers,
  MessageSquare,
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
  BranchTreeDnDProvider,
  useBranchTreeDnD,
  useBranchTreeDnDContext,
} from "../hooks/use-branch-tree-dnd";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import type { IssueNode } from "../lib/build-tree";
import { issuePath } from "../lib/links";
import {
  BRANCH_STATUS_CLASS,
  BRANCH_STATUS_LABEL,
  EPIC_STATUS_CLASS,
  EPIC_STATUS_LABEL,
} from "../lib/derived";
import { CommitStatusSelect } from "./commit-status-select";
import { IssueBadges } from "./issue-badges";

const KIND_ICON: Record<IssueKind, typeof Layers> = {
  project: FolderKanban,
  epic: Layers,
  branch: GitBranch,
  commit: GitCommitHorizontal,
};

function GitChip({
  issue,
  derived,
}: {
  issue: IssueRecord;
  derived?: DerivedState;
}) {
  if (issue.kind === "branch") {
    return (
      <span className="flex items-center gap-2 text-xs">
        {issue.branchName ? (
          <span className="font-mono text-muted-foreground">
            {issue.branchName}
          </span>
        ) : null}
        {derived?.base ? (
          <span className="text-muted-foreground/70">on {derived.base}</span>
        ) : null}
        {issue.prUrl ? (
          <a
            href={issue.prUrl}
            target="_blank"
            rel="noreferrer"
            title={issue.prUrl}
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <GitPullRequest className="h-3.5 w-3.5" />
          </a>
        ) : null}
        {derived?.branchStatus ? (
          <span className={BRANCH_STATUS_CLASS[derived.branchStatus]}>
            {BRANCH_STATUS_LABEL[derived.branchStatus]}
          </span>
        ) : null}
      </span>
    );
  }
  if (issue.kind === "epic" && derived?.epicStatus) {
    return (
      <span className={`text-xs ${EPIC_STATUS_CLASS[derived.epicStatus]}`}>
        {EPIC_STATUS_LABEL[derived.epicStatus]}
      </span>
    );
  }
  if (issue.kind === "commit" && issue.commitSha) {
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
        issue.kind === "branch" ? (
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
                  openNew({ presetKind: "commit", presetParent: issue.id });
                }}
              >
                Add commit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  openNew({
                    presetKind: "branch",
                    presetParent: issue.partOf,
                    presetStackedOn: issue.id,
                  });
                }}
              >
                Add stacked branch
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
  const { getRowDnDProps, consumeDragGesture } = useBranchTreeDnDContext();
  const hasChildren = node.children.length > 0;
  const Icon = KIND_ICON[issue.kind];
  const state = derived[issue.id];
  const isBranch = issue.kind === "branch";
  const { isDragging, isDropTarget, ...rowDnDHandlers } = getRowDnDProps(issue);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent",
          hasChildren && "cursor-pointer",
          isBranch && "cursor-grab active:cursor-grabbing",
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
            <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              blocked
            </span>
          ) : null}
          <IssueBadges issue={issue} compact />
          <GitChip issue={issue} derived={state} />
          {issue.hasDescription ? (
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
          {issue.hasChat ? (
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
          {issue.kind === "commit" ? (
            <CommitStatusSelect id={issue.id} status={issue.status} />
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
  const dnd = useBranchTreeDnD(issues);

  if (nodes.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-sm text-muted-foreground">
        No issues yet.
      </p>
    );
  }
  return (
    <BranchTreeDnDProvider value={dnd}>
      <div className="flex flex-col">
        {nodes.map((node, index) => (
          <Fragment key={node.issue.id}>
            {index > 0 ? <Separator className="my-3" /> : null}
            <TreeRow node={node} derived={derived} />
          </Fragment>
        ))}
      </div>
    </BranchTreeDnDProvider>
  );
}
