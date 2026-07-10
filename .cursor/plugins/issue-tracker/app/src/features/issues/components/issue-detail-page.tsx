import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIssueDetailQuery } from "../api/queries";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { KIND_LABEL } from "../lib/kind";
import { linkNotFoundMessage } from "../lib/links";
import { Markdown } from "./markdown";
import { IssueMetaPanel } from "./issue-meta-panel";
import { IssueBadges } from "./issue-badges";
import { GitStackPanel } from "./git-stack-panel";
import { IssueDetailEdit } from "./issue-detail-edit";
import { ChatPanel } from "./chat-panel";

export function IssueDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const requestDelete = useIssueUiStore((s) => s.requestDelete);
  const [editing, setEditing] = useState(false);
  const redirected = useRef<string | null>(null);

  const { data: issue, isLoading, error } = useIssueDetailQuery(id);

  useEffect(() => {
    setEditing(false);
  }, [id]);

  const missing = error instanceof ApiError && error.status === 404;
  useEffect(() => {
    if (missing && redirected.current !== id) {
      redirected.current = id;
      navigate("/", { replace: true });
      toast.error(linkNotFoundMessage(id));
    }
  }, [missing, id, navigate]);

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8">
      <Link
        to="/"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tree
      </Link>

      {error && !missing ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          {error.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : null}

      {issue ? (
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    requestDelete(issue.id);
                    navigate("/");
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
              {issue.kind === "branch" || issue.kind === "commit" ? (
                <GitStackPanel issue={issue} />
              ) : null}
              <div className="rounded-lg border bg-card p-6">
                {issue.description.trim() ? (
                  <Markdown>{issue.description}</Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No description.
                  </p>
                )}
              </div>
              <ChatPanel id={issue.id} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
