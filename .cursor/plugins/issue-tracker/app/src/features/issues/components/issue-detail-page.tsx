import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIssueDetailQuery, useIssuesQuery } from "../api/queries";
import { useGoToProjectTree } from "../hooks/use-go-to-project-tree";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { KIND_LABEL } from "../lib/kind";
import { issueBelongsToProject, issuesById } from "../lib/build-tree";
import { Markdown } from "./markdown";
import { IssueMetaPanel } from "./issue-meta-panel";
import { IssueBadges } from "./issue-badges";
import { GitStackPanel } from "./git-stack-panel";
import { EpicDepsPanel } from "./epic-deps-panel";
import { AttachmentsPanel } from "./attachments-panel";
import { IssueDetailEdit } from "./issue-detail-edit";
import { ChatPanel } from "./chat-panel";
import { ArchiveIssueButton } from "./archive-issue-button";
import { supportsAttachments } from "../lib/attachments";

export function IssueDetailPage() {
  const { projectId = "", id = "" } = useParams();
  const { go: goToProjectTree, hrefFor: projectTreeHref } =
    useGoToProjectTree();
  const requestDelete = useIssueUiStore((s) => s.requestDelete);
  const [editing, setEditing] = useState(false);

  const { data: issue, isLoading, error } = useIssueDetailQuery(id);
  const { data: list, isLoading: listLoading } = useIssuesQuery();

  useEffect(() => {
    setEditing(false);
  }, [id]);

  const byId = useMemo(
    () => issuesById(list?.issues ?? []),
    [list?.issues],
  );

  const missing = error instanceof ApiError && error.status === 404;
  const wrongProject =
    Boolean(list) && Boolean(issue) && !issueBelongsToProject(id, projectId, byId);
  const showScopeError = missing || wrongProject;
  const loading = isLoading || (Boolean(issue) && listLoading);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <a
        href={projectTreeHref(projectId)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={(e) => {
          e.preventDefault();
          goToProjectTree(projectId);
        }}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tree
      </a>

      {error && !missing ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {error.message}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {showScopeError && !loading ? (
        <div className="rounded-lg border bg-card px-4 py-12 text-center text-sm text-muted-foreground">
          {missing ? (
            <>
              No issue with id <span className="font-mono">{id}</span>.
            </>
          ) : (
            <>
              Issue <span className="font-mono">{id}</span> is not under project{" "}
              <span className="font-mono">{projectId}</span>.
            </>
          )}
        </div>
      ) : null}

      {issue && !showScopeError ? (
        <>
          <header className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {KIND_LABEL[issue.kind]}
              </span>
              <h1 className="break-words text-2xl font-semibold">
                {issue.title}
              </h1>
              <span className="font-mono text-xs text-muted-foreground">
                {issue.id}
              </span>
              <IssueBadges issue={issue} className="mt-2" />
            </div>
            {!editing ? (
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <ArchiveIssueButton issue={issue} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    requestDelete(issue.id);
                    goToProjectTree(projectId);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ) : null}
          </header>

          {editing ? (
            <IssueDetailEdit issue={issue} onDone={() => setEditing(false)} />
          ) : (
            <>
              <IssueMetaPanel issue={issue} />
              {issue.kind === "epic" ? <EpicDepsPanel issue={issue} /> : null}
              {issue.kind === "story" || issue.kind === "task" ? (
                <GitStackPanel issue={issue} />
              ) : null}
              {supportsAttachments(issue.kind) ? (
                <AttachmentsPanel issue={issue} />
              ) : null}
              <div className="rounded-lg border bg-card p-6">
                {issue.description.trim() ? (
                  <Markdown
                    issueId={
                      supportsAttachments(issue.kind) ? issue.id : undefined
                    }
                  >
                    {issue.description}
                  </Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No description.
                  </p>
                )}
              </div>
              <ChatPanel
                id={issue.id}
                attachmentsIssueId={
                  supportsAttachments(issue.kind) ? issue.id : undefined
                }
              />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
