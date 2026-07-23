import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { IssueDetail, ProjectLabel } from "@server/schemas";
import { ApiError } from "@/lib/api/errors";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  isLabelAssignableIssue,
  projectCatalogLabels,
} from "../lib/project-labels";
import { IssueMetaPanel } from "./issue-meta-panel";
import { IssueBadges } from "./issue-badges";
import { ProjectLabelChips } from "./project-label-chips";
import { GitStackPanel } from "./git-stack-panel";
import { EpicDepsPanel } from "./epic-deps-panel";
import { IssueAttachmentsSection } from "./attachments-panel";
import { IssueTitleField } from "./issue-title-field";
import { IssueDescriptionField } from "./issue-description-field";
import { IssueAssignmentLabelsField } from "./issue-assignment-labels-field";
import { IssueProjectLabelsField } from "./issue-project-labels-field";
import { IssueSupportingDocsField } from "./issue-supporting-docs-field";
import { IssueInspirationAppsField } from "./issue-inspiration-apps-field";
import { ChatPanel } from "./chat-panel";
import { ArchiveIssueButton } from "./archive-issue-button";
import { ProjectDetailTabs } from "./project-detail-tabs";
import { supportsAttachments } from "../lib/attachments";

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

function IssueDetailBody({
  issue,
  projectId,
  upload,
  catalog,
}: {
  issue: IssueDetail;
  projectId: string;
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
          <IssueTitleField issue={issue} />
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
        <div className="flex shrink-0 gap-2">
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
      </header>

      <IssueDetailView
        issue={issue}
        catalog={catalog}
        upload={upload}
        attach={attach}
      />
    </>
  );
}

function IssueDetailView({
  issue,
  catalog,
  upload,
  attach,
}: {
  issue: IssueDetail;
  catalog: ProjectLabel[];
  upload?: UploadAttachmentMutation;
  attach: boolean;
}) {
  const overview = (
    <>
      <IssueMetaPanel issue={issue} />
      {issue.kind === "project" ? (
        <IssueProjectLabelsField issue={issue} />
      ) : null}
      {isLabelAssignableIssue(issue) ? (
        <IssueAssignmentLabelsField issue={issue} catalog={catalog} />
      ) : null}
      {issue.kind === "epic" ? <EpicDepsPanel issue={issue} /> : null}
      {issue.kind === "story" || issue.kind === "task" ? (
        <GitStackPanel issue={issue} />
      ) : null}
      <IssueAttachmentsSection issue={issue} upload={upload} />
      <div className="rounded-lg border bg-card p-6">
        <IssueDescriptionField issue={issue} upload={upload} />
      </div>
      {issue.kind === "project" ? (
        <>
          <IssueSupportingDocsField issue={issue} />
          <IssueInspirationAppsField issue={issue} />
        </>
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
  backLink,
  catalog,
}: {
  issue: IssueDetail;
  projectId: string;
  backLink: ReactNode;
  catalog: ProjectLabel[];
}) {
  const upload = useUploadAttachment(issue.id);
  const { rootProps } = useIssueDetailFileUpload(upload);

  return (
    <PageShell {...rootProps}>
      {backLink}
      <IssueDetailBody
        issue={issue}
        projectId={projectId}
        upload={upload}
        catalog={catalog}
      />
    </PageShell>
  );
}

export function IssueDetailPage() {
  const { projectId = "", id = "" } = useParams();

  const { data: issue, isLoading, error } = useIssueDetailQuery(id);
  const { data: list, isLoading: listLoading } = useIssuesQuery();

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
        backLink={backLink}
        catalog={catalog}
      />
    );
  }

  return (
    <PageShell>
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
          catalog={catalog}
        />
      ) : null}
    </PageShell>
  );
}
