import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { request } from "@/lib/api/client";
import type { IssueDetail, IssuesResponse } from "@server/schemas";
import { ApiError } from "@/lib/api/errors";
import { issuesKeys } from "./keys";

export function useIssuesQuery(): UseQueryResult<IssuesResponse, Error> {
  return useQuery({
    queryKey: issuesKeys.list(),
    queryFn: () => request<IssuesResponse>("/api/issues"),
  });
}

export function useIssueDetailQuery(
  id: string,
): UseQueryResult<IssueDetail, Error> {
  return useQuery({
    queryKey: issuesKeys.detail(id),
    queryFn: () => request<IssueDetail>(`/api/issues/${id}`),
    enabled: Boolean(id),
    retry: (count, error) =>
      !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}
