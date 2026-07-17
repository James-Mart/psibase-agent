import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { request } from "@/lib/api/client";
import type {
  ChatMessage,
  ChatMessageInput,
  CreateInput,
  IssueDetail,
  IssuePatch,
  IssueRecord,
} from "@server/schemas";
import type { Attachment } from "@server/services/attachments";
import type { DeletionResult } from "@server/services/deletion";
import { attachmentsApiPath } from "../lib/attachments";
import { issuesKeys } from "./keys";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Request failed";
}

export function useCreateIssue() {
  const qc = useQueryClient();
  return useMutation<IssueRecord, Error, CreateInput>({
    mutationFn: (input) =>
      request<IssueRecord>("/api/issues", { method: "POST", body: input }),
    onError: (err) => toast.error(messageOf(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: issuesKeys.list() }),
  });
}

export function useUpdateIssue() {
  const qc = useQueryClient();
  return useMutation<IssueDetail, Error, { id: string; patch: IssuePatch }>({
    mutationFn: ({ id, patch }) =>
      request<IssueDetail>(`/api/issues/${id}`, {
        method: "PATCH",
        body: patch,
      }),
    onError: (err) => toast.error(messageOf(err)),
    onSuccess: (data) => qc.setQueryData(issuesKeys.detail(data.id), data),
    onSettled: () => qc.invalidateQueries({ queryKey: issuesKeys.list() }),
  });
}

export function usePostMessage(id: string) {
  const qc = useQueryClient();
  return useMutation<ChatMessage, Error, ChatMessageInput>({
    mutationFn: (input) =>
      request<ChatMessage>(`/api/issues/${id}/messages`, {
        method: "POST",
        body: input,
      }),
    onError: (err) => toast.error(messageOf(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: issuesKeys.chat(id) }),
  });
}

export function useDeleteIssue() {
  const qc = useQueryClient();
  return useMutation<DeletionResult, Error, string>({
    mutationFn: (id) =>
      request<DeletionResult>(`/api/issues/${id}`, { method: "DELETE" }),
    onError: (err) => toast.error(messageOf(err)),
    onSettled: (data, _err, id) => {
      qc.invalidateQueries({ queryKey: issuesKeys.list() });
      for (const deletedId of data?.deleted ?? [id]) {
        qc.removeQueries({ queryKey: issuesKeys.detail(deletedId) });
        qc.removeQueries({ queryKey: issuesKeys.chat(deletedId) });
        qc.removeQueries({ queryKey: issuesKeys.attachments(deletedId) });
      }
    },
  });
}

export function useUploadAttachment(id: string) {
  const qc = useQueryClient();
  return useMutation<Attachment, Error, File>({
    mutationFn: (file) => {
      const form = new FormData();
      form.append("file", file);
      return request<Attachment>(attachmentsApiPath(id), {
        method: "POST",
        body: form,
      });
    },
    onError: (err) => toast.error(messageOf(err)),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: issuesKeys.attachments(id) }),
  });
}

export function useDeleteAttachment(id: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (name) =>
      request<void>(attachmentsApiPath(id, name), { method: "DELETE" }),
    onError: (err) => toast.error(messageOf(err)),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: issuesKeys.attachments(id) }),
  });
}

export interface MoveBranchResult {
  moved: string[];
}

export function useMoveBranch() {
  const qc = useQueryClient();
  return useMutation<
    MoveBranchResult,
    Error,
    { id: string; target: string }
  >({
    mutationFn: ({ id, target }) =>
      request<MoveBranchResult>(`/api/issues/${id}/move-branch`, {
        method: "POST",
        body: { target },
      }),
    onError: (err) => toast.error(messageOf(err)),
    onSettled: () => qc.invalidateQueries({ queryKey: issuesKeys.list() }),
  });
}
