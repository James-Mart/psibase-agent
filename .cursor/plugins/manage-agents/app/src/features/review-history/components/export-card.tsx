import { useState } from "react";
import { Check, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useExportBranch, useVerifyExport } from "../api/mutations";
import { useValidateCanonicalChainQuery } from "../api/queries";
import type { ExportResult, RhsSession, ValidationResult } from "../types";

interface Props {
  session: RhsSession;
  hasInflightRun: boolean;
}

const INCOMPLETE_INSTRUCTION =
  "Exporting is only available once you have marked a complete canonical chain from base to a node whose tree matches the final tree.";

function defaultBranchName(session: RhsSession): string {
  const safe = session.sourceRef.replace(/^origin\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `review/${safe}`;
}

export function ExportCard({ session, hasInflightRun }: Props) {
  const [branchName, setBranchName] = useState(defaultBranchName(session));
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<ValidationResult | null>(null);
  const validation = useValidateCanonicalChainQuery(session.id);
  const doExport = useExportBranch(session.id);
  const doVerify = useVerifyExport(session.id);

  const chainComplete = validation.data?.ok === true;
  const exportDisabled =
    !chainComplete || hasInflightRun || doExport.isPending || !branchName.trim();

  return (
    <div className="space-y-3 rounded-md border bg-card p-3 text-xs">
      <div
        className={`flex items-start gap-2 rounded-md border p-2 ${
          chainComplete
            ? "border-success/40 bg-success/10 text-[hsl(var(--success))]"
            : "border-destructive/40 bg-destructive/10 text-destructive"
        }`}
      >
        {chainComplete ? (
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>
          {chainComplete
            ? "Canonical chain is complete and matches the final tree."
            : INCOMPLETE_INSTRUCTION}
        </span>
      </div>
      <div className="space-y-1">
        <Label htmlFor="rhs-branch" className="text-xs">
          Branch name
        </Label>
        <Input
          id="rhs-branch"
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={exportDisabled}
          title={!chainComplete ? INCOMPLETE_INSTRUCTION : undefined}
          onClick={async () => {
            const result = await doExport.mutateAsync({ branchName: branchName.trim() });
            setExportResult(result);
            setVerifyResult(null);
          }}
        >
          Export latest path
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={hasInflightRun || doVerify.isPending || !branchName.trim()}
          onClick={async () => {
            const result = await doVerify.mutateAsync(branchName.trim());
            setVerifyResult(result);
          }}
        >
          Verify exported branch
        </Button>
      </div>
      {exportResult && (
        <div className="rounded-md border bg-background p-2 text-[11px]">
          <p className="font-medium">
            Exported {exportResult.branchName} → {exportResult.tipCommit.slice(0, 12)}
          </p>
          <p className="text-muted-foreground">
            {exportResult.commits.length} commit
            {exportResult.commits.length === 1 ? "" : "s"}
          </p>
        </div>
      )}
      {verifyResult && (
        <div
          className={`flex items-center gap-2 rounded-md border p-2 ${
            verifyResult.ok
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {verifyResult.ok ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" />
          )}
          <span>
            {verifyResult.ok
              ? "Exported branch tip tree matches final tree."
              : verifyResult.detail ?? "verification failed"}
          </span>
        </div>
      )}
    </div>
  );
}
