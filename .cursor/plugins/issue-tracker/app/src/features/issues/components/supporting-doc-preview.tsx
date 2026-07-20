import { useQuery } from "@tanstack/react-query";
import { requestText } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";
import type { SupportingDocPreviewTab } from "../lib/supporting-docs";
import { supportingDocContentUrl } from "../lib/supporting-docs";
import { Markdown } from "./markdown";

const HTML_SANDBOX = "";

function SupportingDocMarkdown({
  projectId,
  tab,
}: {
  projectId: string;
  tab: SupportingDocPreviewTab;
}) {
  const url = supportingDocContentUrl(projectId, tab.ref);
  const { data, isLoading, error } = useQuery({
    queryKey: ["supporting-doc-content", projectId, tab.key, url],
    queryFn: () => requestText(url),
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load document."}
      </p>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-6">
      <Markdown issueId={tab.ref.type === "attachment" ? projectId : undefined}>
        {data ?? ""}
      </Markdown>
    </div>
  );
}

function SupportingDocHtmlFrame({
  projectId,
  tab,
}: {
  projectId: string;
  tab: SupportingDocPreviewTab;
}) {
  const src = supportingDocContentUrl(projectId, tab.ref);
  return (
    <iframe
      title={tab.label}
      src={src}
      sandbox={HTML_SANDBOX}
      className="h-[70vh] w-full rounded-lg border bg-card"
    />
  );
}

export function SupportingDocPreview({
  projectId,
  tab,
}: {
  projectId: string;
  tab: SupportingDocPreviewTab;
}) {
  if (tab.format === "md") {
    return <SupportingDocMarkdown projectId={projectId} tab={tab} />;
  }
  return <SupportingDocHtmlFrame projectId={projectId} tab={tab} />;
}
