import { useMemo, useState } from "react";
import {
  Check,
  Loader2,
  PlayCircle,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  useAbandonEdgeRefinement,
  useAcceptEdgePlan,
  useAcceptEdgeSurvey,
  useBeginEdgeRefinement,
  useCancelEdgeRun,
  useCompleteEdgeRefinement,
  useConstructAllRemaining,
  useStartEdgeRun,
} from "../api/mutations";
import { useEdgeRefinementQuery } from "../api/queries";
import type {
  ChangeSurvey,
  EdgeRefinementIntermediateItem,
  EdgeRefinementPlan,
  RhsEdgeRefinementMode,
  RhsRun,
  RhsSession,
  SemanticPlan,
  VirtualNode,
} from "../types";

interface Props {
  workerName: string;
  session: RhsSession;
  selectedNode: VirtualNode;
  hasInflightRun: boolean;
}

export function RefineSurface({
  workerName,
  session,
  selectedNode,
  hasInflightRun,
}: Props) {
  const targetNodeId = selectedNode.nodeId;
  const isBaseNode = selectedNode.parentNodeId == null;
  const edgeQuery = useEdgeRefinementQuery(
    isBaseNode ? null : session.id,
    isBaseNode ? null : targetNodeId,
  );

  if (isBaseNode) {
    return (
      <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
        The base node has no incoming edge to refine. Select another node to
        refine its incoming edge.
      </div>
    );
  }

  if (edgeQuery.isPending) {
    return <p className="text-xs text-muted-foreground">Loading edge…</p>;
  }
  if (edgeQuery.isError) {
    return (
      <p className="text-xs text-destructive">
        Failed to load edge: {edgeQuery.error?.message ?? "unknown"}
      </p>
    );
  }

  const { refinement, runs, intermediateNodeIds } = edgeQuery.data!;
  if (refinement?.status === "completed") {
    return (
      <div className="rounded-md border bg-card p-3 text-xs">
        This edge has already been refined. Refine a downstream edge to make
        further changes.
      </div>
    );
  }

  if (!refinement) {
    return (
      <BeginRefinementCard
        sessionId={session.id}
        workerName={workerName}
        targetNodeId={targetNodeId}
        hasInflightRun={hasInflightRun}
      />
    );
  }

  return (
    <InProgressRefinement
      session={session}
      workerName={workerName}
      targetNodeId={targetNodeId}
      mode={refinement.mode}
      userConcern={refinement.userConcern}
      survey={(refinement.changeSurvey as ChangeSurvey | null) ?? null}
      semanticPlan={refinement.semanticPlan ?? null}
      runs={runs}
      intermediateNodeIds={intermediateNodeIds}
      hasInflightRun={hasInflightRun}
    />
  );
}

interface BeginProps {
  sessionId: string;
  workerName: string;
  targetNodeId: string;
  hasInflightRun: boolean;
}

function BeginRefinementCard({
  sessionId,
  workerName,
  targetNodeId,
  hasInflightRun,
}: BeginProps) {
  const [mode, setMode] = useState<RhsEdgeRefinementMode>("partition");
  const [userConcern, setUserConcern] = useState("");
  const begin = useBeginEdgeRefinement(sessionId, workerName);

  const canSubmit =
    !hasInflightRun &&
    !begin.isPending &&
    (mode === "partition" || userConcern.trim().length > 0);

  return (
    <div className="space-y-3 rounded-md border bg-card p-3 text-xs">
      <p className="font-medium">Refine this edge</p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "partition" ? "default" : "outline"}
          onClick={() => setMode("partition")}
        >
          Semantic partitioning
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "synthesis" ? "default" : "outline"}
          onClick={() => setMode("synthesis")}
        >
          Intermediate synthesis
        </Button>
      </div>
      <ModeExplainer mode={mode} />
      {mode === "synthesis" && (
        <div className="space-y-1">
          <label className="block font-medium" htmlFor="user-concern">
            What is uncomfortably coupled in this edge?
          </label>
          <Textarea
            id="user-concern"
            rows={3}
            value={userConcern}
            placeholder="Describe what you'd like to split into separate intermediate steps."
            onChange={(e) => setUserConcern(e.target.value)}
          />
        </div>
      )}
      <Button
        type="button"
        size="sm"
        disabled={!canSubmit}
        onClick={() =>
          begin.mutate({
            targetNodeId,
            mode,
            userConcern: mode === "synthesis" ? userConcern.trim() : null,
          })
        }
      >
        {begin.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        Begin refinement
      </Button>
    </div>
  );
}

function ModeExplainer({ mode }: { mode: RhsEdgeRefinementMode }) {
  if (mode === "partition") {
    return (
      <p className="text-muted-foreground">
        Group the existing diff into ordered semantic commits that, applied in
        sequence from the parent commit, reproduce this node&apos;s tree exactly.
      </p>
    );
  }
  return (
    <p className="text-muted-foreground">
      Synthesise additional intermediate commits between the parent and this
      node so that hard-to-review coupling becomes a sequence of smaller,
      reviewable steps.
    </p>
  );
}

interface InProgressProps {
  session: RhsSession;
  workerName: string;
  targetNodeId: string;
  mode: RhsEdgeRefinementMode;
  userConcern: string | null;
  survey: ChangeSurvey | null;
  semanticPlan: SemanticPlan | EdgeRefinementPlan | null;
  runs: RhsRun[];
  intermediateNodeIds: string[];
  hasInflightRun: boolean;
}

function InProgressRefinement({
  session,
  workerName,
  targetNodeId,
  mode,
  userConcern,
  survey,
  semanticPlan,
  runs,
  intermediateNodeIds,
  hasInflightRun,
}: InProgressProps) {
  const startRun = useStartEdgeRun(session.id, targetNodeId);
  const cancelRun = useCancelEdgeRun(session.id, targetNodeId);
  const acceptSurvey = useAcceptEdgeSurvey(session.id, targetNodeId);
  const acceptPlan = useAcceptEdgePlan(session.id, targetNodeId);
  const constructAll = useConstructAllRemaining(session.id, targetNodeId);
  const complete = useCompleteEdgeRefinement(session.id, workerName);
  const abandon = useAbandonEdgeRefinement(session.id, workerName);

  const inflight = runs.find((r) => r.status === "running");
  const latestSurveyRun = runs.find((r) => r.kind === "survey");
  const latestPlanRun = runs.find((r) => r.kind === "plan");

  const planItems = useMemo(
    () => getPlanItems(semanticPlan),
    [semanticPlan],
  );
  const remaining = useMemo(
    () => Math.max(0, planItems.length - intermediateNodeIds.length),
    [planItems.length, intermediateNodeIds.length],
  );
  const treeMatches =
    intermediateNodeIds.length > 0 &&
    intermediateNodeIds.length >= planItems.length;

  const surveyOptional = mode === "synthesis";

  return (
    <div className="space-y-3 rounded-md border bg-card p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="running">In progress</Badge>
        <span className="font-medium">
          Mode: {mode === "partition" ? "Semantic partitioning" : "Intermediate synthesis"}
        </span>
        {userConcern && (
          <span className="text-muted-foreground">— {userConcern}</span>
        )}
        <div className="ml-auto">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={hasInflightRun || abandon.isPending}
            onClick={() => abandon.mutate(targetNodeId)}
          >
            <RotateCcw className="h-3 w-3" /> Abandon
          </Button>
        </div>
      </div>

      {inflight && (
        <div className="flex items-center justify-between rounded border border-primary/30 bg-primary/5 p-2">
          <span>
            Run #{inflight.id} ({inflight.kind}
            {inflight.item_id ? `: ${inflight.item_id}` : ""}) running…
          </span>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-6"
            disabled={cancelRun.isPending}
            onClick={() => cancelRun.mutate(inflight.id)}
          >
            <Square className="h-3 w-3" /> Cancel
          </Button>
        </div>
      )}

      <Step
        title={`1. Change survey${surveyOptional ? " (optional)" : ""}`}
        body={
          <SurveyStep
            survey={survey}
            latestRun={latestSurveyRun}
            disabled={hasInflightRun}
            onRun={(feedback) =>
              startRun.mutate({
                kind: "survey",
                userFeedback: feedback,
                parentRunId: latestSurveyRun?.id,
              })
            }
            onAccept={(runId) => acceptSurvey.mutate(runId)}
          />
        }
      />

      <Step
        title="2. Plan"
        body={
          <PlanStep
            mode={mode}
            survey={survey}
            semanticPlan={semanticPlan}
            latestRun={latestPlanRun}
            disabled={
              hasInflightRun ||
              (mode === "partition" && !survey)
            }
            onRun={(feedback) =>
              startRun.mutate({
                kind: "plan",
                userFeedback: feedback,
                parentRunId: latestPlanRun?.id,
              })
            }
            onAccept={(runId) => acceptPlan.mutate(runId)}
          />
        }
      />

      <Step
        title={`3. Construct ${planItems.length > 0 ? `(${intermediateNodeIds.length}/${planItems.length})` : ""}`}
        body={
          <ConstructStep
            planItems={planItems}
            intermediateNodeIds={intermediateNodeIds}
            remaining={remaining}
            constructPending={constructAll.isPending || hasInflightRun}
            onConstructAll={() => constructAll.mutate()}
            onComplete={() =>
              complete.mutate({
                targetNodeId,
                intermediateNodeIds,
              })
            }
            completePending={complete.isPending}
            completeReady={treeMatches}
          />
        }
      />
    </div>
  );
}

function Step({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded border bg-background/50 p-2">
      <p className="font-medium">{title}</p>
      {body}
    </div>
  );
}

interface SurveyStepProps {
  survey: ChangeSurvey | null;
  latestRun: RhsRun | undefined;
  disabled: boolean;
  onRun: (feedback?: string) => void;
  onAccept: (runId: number) => void;
}

function SurveyStep({
  survey,
  latestRun,
  disabled,
  onRun,
  onAccept,
}: SurveyStepProps) {
  const [feedback, setFeedback] = useState("");
  const accepted = !!survey;
  const lastFinished = latestRun?.status === "finished" ? latestRun : null;
  const lastFinishedOutput = lastFinished ? parseRunOutput(lastFinished) : null;
  return (
    <div className="space-y-2">
      {accepted ? (
        <>
          <div className="flex items-center gap-2 text-[hsl(var(--success))]">
            <Check className="h-3 w-3" /> Survey accepted
          </div>
          <SurveyContent survey={survey} />
        </>
      ) : lastFinished ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>
              Survey run #{lastFinished.id} finished. Review the output and
              accept to lock it in.
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => onAccept(lastFinished.id)}
              disabled={!lastFinishedOutput?.data}
            >
              Accept survey
            </Button>
          </div>
          {lastFinishedOutput?.data ? (
            <SurveyContent survey={lastFinishedOutput.data as ChangeSurvey} />
          ) : (
            <RawOutputFallback output={lastFinishedOutput} />
          )}
        </>
      ) : (
        <p className="text-muted-foreground">
          No survey yet. Run the surveyor to produce one.
        </p>
      )}
      <Textarea
        rows={2}
        placeholder="Optional feedback for re-running the surveyor."
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => onRun(feedback.trim() || undefined)}
      >
        <PlayCircle className="h-3 w-3" /> Run surveyor
      </Button>
    </div>
  );
}

function SurveyContent({ survey }: { survey: ChangeSurvey }) {
  return (
    <div className="space-y-2 rounded border bg-background/60 p-2">
      {survey.summary && (
        <p className="whitespace-pre-wrap">{survey.summary}</p>
      )}
      <SurveyList label="Touched areas" items={survey.touchedAreas} />
      <SurveyList label="Notable changes" items={survey.notableChanges} />
      <SurveyList
        label="Ambiguous or risky areas"
        items={survey.ambiguousOrRiskyAreas}
      />
    </div>
  );
}

function SurveyList({ label, items }: { label: string; items: string[] | undefined }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className="font-medium">{label}</p>
      <ul className="list-disc space-y-0.5 pl-5">
        {items.map((item, idx) => (
          <li key={idx} className="whitespace-pre-wrap">{item}</li>
        ))}
      </ul>
    </div>
  );
}

interface PlanStepProps {
  mode: RhsEdgeRefinementMode;
  survey: ChangeSurvey | null;
  semanticPlan: SemanticPlan | EdgeRefinementPlan | null;
  latestRun: RhsRun | undefined;
  disabled: boolean;
  onRun: (feedback?: string) => void;
  onAccept: (runId: number) => void;
}

function PlanStep({
  mode,
  survey,
  semanticPlan,
  latestRun,
  disabled,
  onRun,
  onAccept,
}: PlanStepProps) {
  const [feedback, setFeedback] = useState("");
  const accepted = !!semanticPlan;
  const lastFinished = latestRun?.status === "finished" ? latestRun : null;
  const lastFinishedOutput = lastFinished ? parseRunOutput(lastFinished) : null;
  const acceptedItems = useMemo(() => getPlanItems(semanticPlan), [semanticPlan]);
  const proposedItems = useMemo(
    () => (lastFinishedOutput?.data ? getPlanItems(lastFinishedOutput.data as SemanticPlan | EdgeRefinementPlan) : []),
    [lastFinishedOutput?.data],
  );
  return (
    <div className="space-y-2">
      {accepted ? (
        <>
          <div className="flex items-center gap-2 text-[hsl(var(--success))]">
            <Check className="h-3 w-3" /> Plan accepted
          </div>
          <PlanItemsList items={acceptedItems} />
        </>
      ) : lastFinished ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <span>
              Plan run #{lastFinished.id} finished. Accept to lock it in.
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => onAccept(lastFinished.id)}
              disabled={proposedItems.length === 0}
            >
              Accept plan
            </Button>
          </div>
          {proposedItems.length > 0 ? (
            <PlanItemsList items={proposedItems} />
          ) : (
            <RawOutputFallback output={lastFinishedOutput} />
          )}
        </>
      ) : (
        <p className="text-muted-foreground">
          {mode === "partition"
            ? "No plan yet. Accept the survey first, then run the partitioner."
            : "No plan yet. Run the refinement planner."}
        </p>
      )}
      {mode === "partition" && !survey && (
        <p className="text-muted-foreground">
          Disabled until the survey is accepted.
        </p>
      )}
      <Textarea
        rows={2}
        placeholder="Optional feedback for re-running the planner."
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        onClick={() => onRun(feedback.trim() || undefined)}
      >
        <PlayCircle className="h-3 w-3" /> Run planner
      </Button>
    </div>
  );
}

function PlanItemsList({ items }: { items: PlanItem[] }) {
  return (
    <ol className="space-y-1 rounded border bg-background/60 p-2 font-mono">
      {items.map((item, idx) => (
        <li key={item.id} className="space-y-0.5">
          <div>
            <span className="text-muted-foreground">{idx + 1}.</span>{" "}
            <span className="text-muted-foreground">{item.id}:</span>{" "}
            {item.title ?? item.intent}
          </div>
          {item.title && item.intent !== item.title && (
            <div className="pl-4 text-muted-foreground whitespace-pre-wrap">
              {item.intent}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

interface ParsedRunOutput {
  data: unknown | null;
  text: string | null;
  reason: string | null;
}

function parseRunOutput(run: RhsRun): ParsedRunOutput {
  if (!run.result_json) return { data: null, text: null, reason: null };
  try {
    const p = JSON.parse(run.result_json) as {
      ok?: boolean;
      data?: unknown;
      text?: string;
      reason?: string;
    };
    return {
      data: p.ok && p.data ? p.data : null,
      text: p.text ?? null,
      reason: p.reason ?? null,
    };
  } catch {
    return { data: null, text: null, reason: "result_json is not valid JSON" };
  }
}

function RawOutputFallback({ output }: { output: ParsedRunOutput | null }) {
  if (!output) return null;
  const body = output.reason ?? output.text;
  if (!body) return null;
  return (
    <pre className="max-h-64 overflow-auto rounded border bg-background/60 p-2 text-[11px] whitespace-pre-wrap">
      {body}
    </pre>
  );
}

interface ConstructStepProps {
  planItems: PlanItem[];
  intermediateNodeIds: string[];
  remaining: number;
  constructPending: boolean;
  onConstructAll: () => void;
  onComplete: () => void;
  completePending: boolean;
  completeReady: boolean;
}

function ConstructStep({
  planItems,
  intermediateNodeIds,
  remaining,
  constructPending,
  onConstructAll,
  onComplete,
  completePending,
  completeReady,
}: ConstructStepProps) {
  if (planItems.length === 0) {
    return (
      <p className="text-muted-foreground">
        No plan accepted yet. Accept the plan in the previous step.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ol className="space-y-1 font-mono">
        {planItems.map((item, idx) => {
          const constructed = idx < intermediateNodeIds.length;
          return (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded border bg-background px-2 py-1"
            >
              {constructed ? (
                <Check className="h-3 w-3 text-[hsl(var(--success))]" />
              ) : (
                <X className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="truncate">
                <span className="text-muted-foreground">{item.id}:</span>{" "}
                {item.title ?? item.intent}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={constructPending || remaining === 0}
          onClick={onConstructAll}
        >
          {constructPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <PlayCircle className="h-3 w-3" />
          )}
          Construct all remaining ({remaining})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="default"
          disabled={
            completePending || intermediateNodeIds.length === 0 || !completeReady
          }
          onClick={onComplete}
        >
          {completePending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Complete refinement
        </Button>
      </div>
    </div>
  );
}

interface PlanItem {
  id: string;
  title?: string;
  intent: string;
}

function getPlanItems(
  plan: SemanticPlan | EdgeRefinementPlan | null,
): PlanItem[] {
  if (!plan) return [];
  if ("items" in plan && Array.isArray(plan.items)) {
    return plan.items.map((it) => ({
      id: it.id,
      title: it.title,
      intent: it.intent,
    }));
  }
  if ("intermediateItems" in plan && Array.isArray(plan.intermediateItems)) {
    return plan.intermediateItems.map((it: EdgeRefinementIntermediateItem) => ({
      id: it.id,
      intent: it.intent,
    }));
  }
  return [];
}
