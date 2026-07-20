import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { IssueDetail, ProjectLabel } from "@server/schemas";
import { ApiError } from "@/lib/api/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";
import { useIssueDetailQuery, useIssuesQuery } from "../api/queries";
import { useUploadAttachment } from "../api/mutations";
import {
  useIssueDetailFileUpload,
  type UploadAttachmentMutation,
} from "../hooks/use-issue-detail-file-upload";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { KIND_LABEL, kindHas } from "../lib/kind";
import { issueBelongsToProject, issuesById } from "../lib/build-tree";
import { projectPath } from "../lib/links";
import { projectCatalogLabels } from "../lib/project-labels";
import { Markdown } from "./markdown";
import { IssueMetaPanel } from "./issue-meta-panel";
import { IssueBadges } from "./issue-badges";
import { ProjectLabelChips } from "./project-label-chips";
import { GitStackPanel } from "./git-stack-panel";
import { EpicDepsPanel } from "./epic-deps-panel";
import { IssueAttachmentsSection } from "./attachments-panel";
import { IssueDetailEdit } from "./issue-detail-edit";
import { ChatPanel } from "./chat-panel";
import { ArchiveIssueButton } from "./archive-issue-button";
import { SupportingDocsSection } from "./supporting-docs-section";
import { ProjectDetailTabs } from "./project-detail-tabs";
import { supportsAttachments } from "../lib/attachments";

const DETAIL_SHELL_CLASS =
  "mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-8";

function CopyIssueIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const resetCopiedRef = useRef<ReturnType<typeof window.setTimeout>>();

  useEffect(() => {
    return () => {
      if (resetCopiedRef.current !== undefined) {
        window.clearTimeout(resetCopiedRef.current);
      }
    };
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title="Copy id"
      className="shrink-0 text-muted-foreground"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          setCopied(true);
          if (resetCopiedRef.current !== undefined) {
            window.clearTimeout(resetCopiedRef.current);
          }
          resetCopiedRef.current = window.setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Could not copy to clipboard");
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

function DetailShell({
  className,
  children,
  ...rootProps
}: {
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(DETAIL_SHELL_CLASS, className)} {...rootProps}>
      {children}
    </div>
  );
}

function IssueDetailBody({
  issue,
  projectId,
  editing,
  setEditing,
  upload,
  catalog,
}: {
  issue: IssueDetail;
  projectId: string;
  editing: boolean;
  setEditing: (value: boolean) => void;
  upload?: UploadAttachmentMutation;
  catalog: ProjectLabel[];
}) {
  const navigate = useNavigate();
  const requestDelete = useIssueUiStore((s) => s.requestDelete);
  const attach = supportsAttachments(issue.kind);

  return (
    <>
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {KIND_LABEL[issue.kind]}
          </span>
          <h1 className="break-words text-2xl font-semibold">{issue.title}</h1>
          <div className="mt-0.5 flex items-center gap-0.5">
            <span className="font-mono text-xs text-muted-foreground">
              {issue.id}
            </span>
            <CopyIssueIdButton id={issue.id} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ProjectLabelChips issue={issue} catalog={catalog} />
            <IssueBadges issue={issue} />
          </div>
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
                navigate(projectPath(projectId));
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null}
      </header>

      {editing ? (
        <IssueDetailEdit
          issue={issue}
          catalog={catalog}
          onDone={() => setEditing(false)}
          upload={upload}
        />
      ) : (
        <IssueDetailView issue={issue} upload={upload} attach={attach} />
      )}
    </>
  );
}

function IssueDetailView({
  issue,
  upload,
  attach,
}: {
  issue: IssueDetail;
  upload?: UploadAttachmentMutation;
  attach: boolean;
}) {
  const overview = (
    <>
      <IssueMetaPanel issue={issue} />
      {issue.kind === "epic" ? <EpicDepsPanel issue={issue} /> : null}
      {issue.kind === "story" || issue.kind === "task" ? (
        <GitStackPanel issue={issue} />
      ) : null}
      <IssueAttachmentsSection issue={issue} upload={upload} />
      <div className="rounded-lg border bg-card p-6">
        {issue.description.trim() ? (
          <Markdown issueId={attach ? issue.id : undefined}>
            {issue.description}
          </Markdown>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )}
      </div>
      {issue.kind === "project" ? (
        <SupportingDocsSection supportingDocs={issue.supportingDocs} />
      ) : null}
      {kindHas(issue.kind, "chat") ? (
        <ChatPanel
          id={issue.id}
          attachmentsIssueId={attach ? issue.id : undefined}
        />
      ) : null}
    </>
  );

  if (issue.kind !== "project") {
    return overview;
  }

  return (
    <ProjectDetailTabs
      projectId={issue.id}
      supportingDocs={issue.supportingDocs}
      overview={overview}
    />
  );
}

/** Owns the shared upload mutation + page drop/paste target for attachable issues. */
function IssueDetailAttachable({
  issue,
  projectId,
  editing,
  setEditing,
  backLink,
  catalog,
}: {
  issue: IssueDetail;
  projectId: string;
  editing: boolean;
  setEditing: (value: boolean) => void;
  backLink: ReactNode;
  catalog: ProjectLabel[];
}) {
  const upload = useUploadAttachment(issue.id);
  const { rootProps } = useIssueDetailFileUpload(upload);

  return (
    <DetailShell {...rootProps}>
      {backLink}
      <IssueDetailBody
        issue={issue}
        projectId={projectId}
        editing={editing}
        setEditing={setEditing}
        upload={upload}
        catalog={catalog}
      />
    </DetailShell>
  );
}

export function IssueDetailPage() {
  const { projectId = "", id = "" } = useParams();
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

  const catalog = useMemo(
    () => projectCatalogLabels(byId, projectId),
    [byId, projectId],
  );

  const missing = error instanceof ApiError && error.status === 404;
  const wrongProject =
    Boolean(list) && Boolean(issue) && !issueBelongsToProject(id, projectId, byId);
  const showScopeError = missing || wrongProject;
  const loading = isLoading || (Boolean(issue) && listLoading);

  const backLink = (
    <Link
      to={projectPath(projectId)}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to tree
    </Link>
  );

  if (
    issue &&
    !showScopeError &&
    !loading &&
    supportsAttachments(issue.kind)
  ) {
    return (
      <IssueDetailAttachable
        issue={issue}
        projectId={projectId}
        editing={editing}
        setEditing={setEditing}
        backLink={backLink}
        catalog={catalog}
      />
    );
  }

  return (
    <DetailShell>
      {backLink}

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
        <IssueDetailBody
          issue={issue}
          projectId={projectId}
          editing={editing}
          setEditing={setEditing}
          catalog={catalog}
        />
      ) : null}
    </DetailShell>
  );
}
