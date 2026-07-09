import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ISSUE_LINK_PREFIX, issuePath, parseIssueLink } from "../lib/links";
import { useIssueLinkNavigate } from "./issue-link";

function transformUrl(url: string): string {
  return url.startsWith(ISSUE_LINK_PREFIX) ? url : defaultUrlTransform(url);
}

function IssueAwareLink({
  href,
  children,
  node: _node,
  ...props
}: ComponentPropsWithoutRef<"a"> & { node?: unknown }) {
  const go = useIssueLinkNavigate();
  const targetId = parseIssueLink(href);
  if (targetId !== null) {
    return (
      <a
        href={issuePath(targetId)}
        onClick={(e) => {
          e.preventDefault();
          go(targetId);
        }}
        {...props}
      >
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  );
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-issue">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={transformUrl}
        components={{ a: IssueAwareLink }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
