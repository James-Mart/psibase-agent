import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateSession } from "../api/mutations";
import { useApiKeyAvailable } from "./api-key-banner";

interface Props {
  workerName: string;
  currentBranch: string;
  defaultBaseRef: string;
}

export function SessionSetupCard({
  workerName,
  currentBranch,
  defaultBaseRef,
}: Props) {
  const [baseRef, setBaseRef] = useState(defaultBaseRef);
  const create = useCreateSession(workerName);
  const apiKeyOk = useApiKeyAvailable();

  return (
    <form
      className="space-y-3 rounded-md border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!apiKeyOk) return;
        create.mutate({ baseRef: baseRef.trim() });
      }}
    >
      <p className="text-xs text-muted-foreground">
        Source ref:{" "}
        <code className="rounded bg-muted px-1">{currentBranch}</code> (the
        worker's current branch)
      </p>
      <div className="grid gap-2">
        <Label htmlFor="rhs-baseRef" className="text-xs">
          Base ref
        </Label>
        <Input
          id="rhs-baseRef"
          value={baseRef}
          onChange={(e) => setBaseRef(e.target.value)}
          placeholder="origin/main"
          className="h-8 text-xs"
          required
        />
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={!apiKeyOk || create.isPending || !baseRef.trim()}
      >
        {create.isPending ? "Creating..." : "Create session"}
      </Button>
    </form>
  );
}
