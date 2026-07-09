import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useIssuesQuery } from "../api/queries";
import { issuePath, linkNotFoundMessage } from "../lib/links";

export function useIssueLinkNavigate(): (id: string) => void {
  const navigate = useNavigate();
  const { data } = useIssuesQuery();
  return (id) => {
    if (data && !data.issues.some((issue) => issue.id === id)) {
      toast.error(linkNotFoundMessage(id));
      return;
    }
    navigate(issuePath(id));
  };
}

export function IssueLink({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const go = useIssueLinkNavigate();
  return (
    <a
      href={issuePath(id)}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        go(id);
      }}
    >
      {children}
    </a>
  );
}
