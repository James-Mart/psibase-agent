import { useEffect, useMemo, useState } from "react";
import { KINDS, PARENT_KIND, type IssueKind } from "@server/schemas";

// Projects are created from the sidebar, not this dialog.
const SELECTABLE_KINDS = KINDS.filter((kind) => kind !== "project");
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateIssue } from "../api/mutations";
import { useIssuesQuery } from "../api/queries";
import { useIssueUiStore } from "../store/use-issue-ui-store";
import { KIND_LABEL } from "../lib/kind";

export function NewIssueDialog() {
  const target = useIssueUiStore((s) => s.newIssue);
  const closeNew = useIssueUiStore((s) => s.closeNew);
  const { data } = useIssuesQuery();
  const createIssue = useCreateIssue();

  const [kind, setKind] = useState<IssueKind>("epic");
  const [title, setTitle] = useState("");
  const [parent, setParent] = useState<string>("");
  const [stackedOn, setStackedOn] = useState<string>("");

  const kindLocked = Boolean(target?.presetKind);
  const parentLocked = Boolean(target?.presetParent);

  useEffect(() => {
    if (!target) return;
    setKind(target.presetKind ?? "epic");
    setParent(target.presetParent ?? "");
    setStackedOn(target.presetStackedOn ?? "");
    setTitle("");
  }, [target]);

  const parentKind = PARENT_KIND[kind];
  const parentOptions = useMemo(
    () => (data?.issues ?? []).filter((issue) => issue.kind === parentKind),
    [data?.issues, parentKind],
  );

  const needsParent = parentKind !== null;
  const canSubmit =
    title.trim().length > 0 &&
    (!needsParent || parent.length > 0) &&
    !createIssue.isPending;

  const submit = () => {
    if (!canSubmit) return;
    createIssue.mutate(
      {
        kind,
        title: title.trim(),
        partOf: needsParent ? parent : undefined,
        stackedOn: stackedOn || undefined,
      },
      { onSuccess: () => closeNew() },
    );
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && closeNew()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New {KIND_LABEL[kind].toLowerCase()}</DialogTitle>
          <DialogDescription>
            Create an issue in the Epic &rsaquo; Story &rsaquo; Task tree.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {!kindLocked ? (
            <div className="grid gap-1.5">
              <Label>Kind</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as IssueKind);
                  setParent("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_KINDS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {KIND_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="new-issue-title">Title</Label>
            <Input
              id="new-issue-title"
              value={title}
              autoFocus
              placeholder={`${KIND_LABEL[kind]} title`}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>

          {needsParent && !parentLocked ? (
            <div className="grid gap-1.5">
              <Label>Part of ({parentKind})</Label>
              <Select value={parent} onValueChange={setParent}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select a ${parentKind}`} />
                </SelectTrigger>
                <SelectContent>
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {parentLocked ? (
            <p className="text-xs text-muted-foreground">
              Part of <span className="font-mono">{parent}</span>
            </p>
          ) : null}

          {target?.presetStackedOn ? (
            <p className="text-xs text-muted-foreground">
              Stacked on <span className="font-mono">{stackedOn}</span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => closeNew()}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
