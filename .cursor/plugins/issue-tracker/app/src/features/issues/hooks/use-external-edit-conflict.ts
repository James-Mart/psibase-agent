import { useState } from "react";
import type { IssueDetail } from "@server/schemas";

export interface ExternalEditConflict {
  hasConflict: boolean;
  acknowledge: () => void;
}

export function useExternalEditConflict(issue: IssueDetail): ExternalEditConflict {
  const [baseline, setBaseline] = useState(issue.version);
  return {
    hasConflict: issue.version !== baseline,
    acknowledge: () => setBaseline(issue.version),
  };
}
