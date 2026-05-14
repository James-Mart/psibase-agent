import { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeleteSession } from "../api/mutations";
import {
  useInProgressRefinementQuery,
  useNodeDiffQuery,
  useNodeGraphQuery,
  useRhsSessionForWorkerQuery,
} from "../api/queries";
import { useRhsRunStream } from "../hooks/use-rhs-run-stream";
import { useRhsUiStore } from "../store/use-rhs-ui-store";
import { AgentRunStream } from "./agent-run-stream";
import { ApiKeyBanner } from "./api-key-banner";
import { DiffViewer } from "./diff-viewer";
import { ExportCard } from "./export-card";
import { ModelSettingsCard } from "./model-settings-card";
import { RefineSurface } from "./refine-surface";
import { SessionBranchMismatchCard } from "./session-branch-mismatch-card";
import { SessionPreparingCard } from "./session-preparing-card";
import { SessionSetupCard } from "./session-setup-card";
import { VirtualNodeGraph } from "./virtual-node-graph";

interface Props {
  name: string;
  defaultBaseRef?: string;
}

export function ReviewHistoryPanel({ name, defaultBaseRef }: Props) {
  const sessionQuery = useRhsSessionForWorkerQuery(name);
  const setSelectedNode = useRhsUiStore((s) => s.setSelectedNode);
  const selectedNodeId = useRhsUiStore((s) => s.selectedNodeId);
  const innerTab = useRhsUiStore((s) => s.innerTab);
  const setInnerTab = useRhsUiStore((s) => s.setInnerTab);

  const envelope = sessionQuery.data;
  const session = envelope?.session ?? null;
  const isOnLockedBranch =
    !!session && envelope!.currentBranch === session.workerBranch;

  const sessionId = session && isOnLockedBranch ? session.id : null;
  useRhsRunStream(sessionId, name);

  const graphQuery = useNodeGraphQuery(sessionId);
  const inProgressQuery = useInProgressRefinementQuery(sessionId);
  const deleteSession = useDeleteSession(name);

  const inProgressRefinement = inProgressQuery.data ?? null;
  const hasInflightRun = false; // refine-surface tracks its own inflight run state via the edge query

  useEffect(() => {
    if (!session || !graphQuery.data) return;
    const graphHas = (id: string | null) =>
      !!id && graphQuery.data!.nodes.some((n) => n.nodeId === id);
    if (!graphHas(selectedNodeId)) {
      setSelectedNode(graphQuery.data.activeHeadId);
    }
  }, [session, graphQuery.data, selectedNodeId, setSelectedNode]);

  const selectedNode = useMemo(() => {
    if (!graphQuery.data || !selectedNodeId) return null;
    return graphQuery.data.nodes.find((n) => n.nodeId === selectedNodeId) ?? null;
  }, [graphQuery.data, selectedNodeId]);

  const diffQuery = useNodeDiffQuery(
    sessionId,
    innerTab === "diff" ? selectedNodeId : null,
  );

  if (deleteSession.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-card p-4 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Cleaning up session worktree… this can take ~10 seconds.</span>
      </div>
    );
  }

  if (sessionQuery.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!envelope) {
    return (
      <p className="text-xs text-destructive">
        Failed to load review-history session: {String(sessionQuery.error?.message ?? "")}
      </p>
    );
  }

  const currentBranch = envelope.currentBranch;

  if (!session) {
    return (
      <div className="space-y-3">
        <ApiKeyBanner />
        <SessionSetupCard
          workerName={name}
          currentBranch={currentBranch}
          defaultBaseRef={defaultBaseRef ?? "origin/main"}
        />
      </div>
    );
  }

  if (session.prepStatus !== "ready") {
    return (
      <div className="space-y-3">
        <ApiKeyBanner />
        <SessionPreparingCard session={session} />
      </div>
    );
  }

  if (!isOnLockedBranch) {
    return (
      <div className="space-y-3">
        <ApiKeyBanner />
        <SessionBranchMismatchCard
          workerName={name}
          session={session}
          currentBranch={currentBranch}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ApiKeyBanner />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Session for{" "}
          <code className="rounded bg-muted px-1">{session.workerBranch}</code>{" "}
          (base: <code>{session.baseRef}</code>, source:{" "}
          <code>{session.sourceRef}</code>)
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive"
          disabled={deleteSession.isPending}
          onClick={() => deleteSession.mutate()}
        >
          Delete session
        </Button>
      </div>

      <ModelSettingsCard
        workerName={name}
        session={session}
        disabled={hasInflightRun}
      />

      {graphQuery.data && <VirtualNodeGraph graph={graphQuery.data} />}

      {inProgressRefinement &&
        inProgressRefinement.targetNodeId !== selectedNodeId && (
          <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
            <span>
              A refinement is in progress on a different node. Click it to focus.
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => setSelectedNode(inProgressRefinement.targetNodeId)}
            >
              Focus refinement
            </Button>
          </div>
        )}

      <Tabs
        value={innerTab}
        onValueChange={(v) => setInnerTab(v as "diff" | "refine")}
        className="flex flex-col"
      >
        <TabsList className="self-start">
          <TabsTrigger value="diff">Diff</TabsTrigger>
          <TabsTrigger value="refine">Refine</TabsTrigger>
        </TabsList>
        <TabsContent value="diff">
          {!selectedNode ? (
            <p className="text-xs text-muted-foreground">Select a node.</p>
          ) : !selectedNode.parentNodeId ? (
            <p className="text-xs text-muted-foreground">
              Base node has no incoming edge.
            </p>
          ) : diffQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : diffQuery.isError ? (
            <p className="text-xs text-destructive">
              Failed to load diff: {diffQuery.error?.message ?? "unknown"}
            </p>
          ) : (
            <DiffViewer diff={diffQuery.data!.diff} />
          )}
        </TabsContent>
        <TabsContent value="refine">
          {!selectedNode ? (
            <p className="text-xs text-muted-foreground">Select a node.</p>
          ) : (
            <RefineSurface
              workerName={name}
              session={session}
              selectedNode={selectedNode}
              hasInflightRun={hasInflightRun}
            />
          )}
        </TabsContent>
      </Tabs>

      <ExportCard session={session} hasInflightRun={hasInflightRun} />
      <AgentRunStream workerName={name} sessionId={session.id} />
    </div>
  );
}
