import {
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  Layers,
  Plus,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { CHILD_KIND, type IssueKind, type IssueRecord } from "@server/schemas";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import type { IssueNode } from "../lib/build-tree";
import { issuePath } from "../lib/links";
import { CommitStatusSelect } from "./commit-status-select";

const KIND_ICON: Record<IssueKind, typeof Layers> = {
  epic: Layers,
  branch: GitBranch,
  commit: GitCommitHorizontal,
};

function GitChip({ issue }: { issue: IssueRecord }) {
  if (issue.kind === "branch" && issue.branchName) {
    return (
      <span className="font-mono text-xs text-muted-foreground">
        {issue.branchName}
        {issue.merged ? " (merged)" : ""}
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

function TreeRow({ node, depth }: { node: IssueNode; depth: number }) {
  const { issue } = node;
  const expanded = useIssueUiStore((s) => s.expanded[issue.id] ?? true);
  const toggle = useIssueUiStore((s) => s.toggle);
  const hasChildren = node.children.length > 0;
  const Icon = KIND_ICON[issue.kind];

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent",
          hasChildren && "cursor-pointer",
        )}
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
        onClick={hasChildren ? () => toggle(issue.id) : undefined}
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
          to={issuePath(issue.id)}
          className="truncate text-sm hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {issue.title}
        </Link>
        <span className="ml-auto flex items-center gap-2">
          <GitChip issue={issue} />
          {issue.hasDescription ? (
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          ) : null}
          {issue.kind === "commit" ? (
            <CommitStatusSelect id={issue.id} status={issue.status} />
          ) : null}
          <RowActions issue={issue} />
        </span>
      </div>
      {hasChildren && expanded ? (
        <div>
          {node.children.map((child) => (
            <TreeRow key={child.issue.id} node={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function IssueTree({ nodes }: { nodes: IssueNode[] }) {
  if (nodes.length === 0) {
    return (
      <p className="px-2 py-8 text-center text-sm text-muted-foreground">
        No issues yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col">
      {nodes.map((node) => (
        <TreeRow key={node.issue.id} node={node} depth={0} />
      ))}
    </div>
  );
}
