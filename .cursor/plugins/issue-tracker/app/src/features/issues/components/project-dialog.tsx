import { useEffect, useState } from "react";
import { FIELD_LABELS } from "@server/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateIssue, useUpdateIssue } from "../api/mutations";
import { useGoToProjectTree } from "../hooks/use-go-to-project-tree";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { WorkspacePathInput } from "./workspace-path-input";

export function ProjectDialog() {
  const { go: goToProjectTree } = useGoToProjectTree();
  const target = useIssueUiStore((s) => s.projectDialog);
  const close = useIssueUiStore((s) => s.closeProjectDialog);
  const createIssue = useCreateIssue();
  const updateIssue = useUpdateIssue();

  const isRename = Boolean(target?.id);
  const [title, setTitle] = useState("");
  const [workspace, setWorkspace] = useState("");

  useEffect(() => {
    if (target) {
      setTitle(target.title ?? "");
      setWorkspace("");
    }
  }, [target]);

  const pending = createIssue.isPending || updateIssue.isPending;
  const canSubmit = title.trim().length > 0 && !pending;

  const submit = () => {
    if (!canSubmit) return;
    const name = title.trim();
    if (isRename && target?.id) {
      updateIssue.mutate(
        { id: target.id, patch: { title: name } },
        { onSuccess: () => close() },
      );
    } else {
      const trimmedWorkspace = workspace.trim();
      createIssue.mutate(
        {
          kind: "project",
          title: name,
          ...(trimmedWorkspace ? { workspace: trimmedWorkspace } : {}),
        },
        {
          onSuccess: (project) => {
            goToProjectTree(project.id);
            close();
          },
        },
      );
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isRename ? "Rename project" : "New project"}</DialogTitle>
          <DialogDescription>
            A project groups related epics.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="project-title">Title</Label>
          <Input
            id="project-title"
            value={title}
            autoFocus
            placeholder="Project title"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        {!isRename ? (
          <div className="grid gap-1.5">
            <Label htmlFor="project-workspace">{FIELD_LABELS.workspace}</Label>
            <WorkspacePathInput
              id="project-workspace"
              value={workspace}
              optional
              onChange={setWorkspace}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => close()}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {isRename ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
