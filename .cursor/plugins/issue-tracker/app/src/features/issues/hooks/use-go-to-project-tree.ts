import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { projectPath } from "../lib/links";
import { useIssueUiStore } from "../store/use-issue-ui-store";

export function useGoToProjectTree(): {
  go: (projectId: string, options?: { replace?: boolean }) => void;
  hrefFor: (projectId: string) => string;
} {
  const navigate = useNavigate();
  const setView = useIssueUiStore((s) => s.setView);

  const go = useCallback(
    (projectId: string, options?: { replace?: boolean }) => {
      setView("tree");
      navigate(projectPath(projectId), { replace: options?.replace });
    },
    [navigate, setView],
  );

  const hrefFor = useCallback(
    (projectId: string) => projectPath(projectId),
    [],
  );

  return { go, hrefFor };
}
