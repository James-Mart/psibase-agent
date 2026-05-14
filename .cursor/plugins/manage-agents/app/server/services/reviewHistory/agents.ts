import { EventEmitter, setMaxListeners } from "events";

import { Agent, type Run, type SDKAgent, type SDKMessage } from "@cursor/sdk";

setMaxListeners(50);

import {
  getRhsRun,
  insertRhsRun,
  listRhsRunsForEdge,
  setRhsRunFinished,
  type RhsRunKind,
  type RhsRunRow,
} from "../../db.js";
import { HttpError } from "../../errors.js";
import {
  advanceSynthesisHead,
  checkpointSynthesisWorktree,
  ensureNoRunningRun,
  ensureSessionReady,
  getEdgeRefinement,
  getIntermediateNodeIds,
  getNode,
  getSessionById,
  getSynthesisHeadCommit,
  getSynthesisHeadNodeIdOrBefore,
  rollbackSynthesisForInProgressRefinement,
  setAcceptedPlanForEdge,
  setAcceptedSurveyForEdge,
  type EdgeRefinementView,
  type SessionView,
  type VirtualNodeView,
} from "./sessions.js";
import { unifiedDiff } from "./git.js";

export type RhsRunPhase =
  | "queued"
  | "spawning_agent"
  | "agent_ready"
  | "sending_prompt"
  | "awaiting_first_message"
  | "streaming"
  | "tool_running"
  | "tool_done"
  | "thinking"
  | "finalizing"
  | "finished"
  | "error"
  | "cancelled";

export interface RhsRunPhasePayload {
  phase: RhsRunPhase;
  label: string;
  elapsedMs: number;
  phaseMs?: number;
  detail?: string;
}

export interface RhsRunEvent {
  runId: number;
  sessionId: string;
  targetNodeId: string;
  kind: RhsRunKind;
  type:
    | "started"
    | "sdk_message"
    | "stderr"
    | "finished"
    | "error"
    | "cancelled"
    | "loop_progress"
    | "phase";
  payload?: unknown;
}

export const runEvents = new EventEmitter();
runEvents.setMaxListeners(50);

interface ActiveRun {
  agent: SDKAgent;
  run: Run;
}

const activeRuns = new Map<number, ActiveRun>();

interface PhaseTracker {
  mark(
    phase: RhsRunPhase,
    label: string,
    detail?: string,
    eventPhaseMsOverride?: number,
  ): void;
  summary(): void;
  lastPhase(): RhsRunPhase | null;
}

const activePhaseTrackers = new Map<number, PhaseTracker>();

function createPhaseTracker(
  runId: number,
  sessionId: string,
  targetNodeId: string,
  kind: RhsRunKind,
): PhaseTracker {
  const startNs = process.hrtime.bigint();
  let prevNs = startNs;
  let lastPhase: RhsRunPhase | null = null;
  const breakdown: Record<string, number> = {};
  return {
    mark(phase, label, detail, eventPhaseMsOverride) {
      const nowNs = process.hrtime.bigint();
      const elapsedMs = Number(nowNs - startNs) / 1_000_000;
      const actualPhaseMs = Number(nowNs - prevNs) / 1_000_000;
      prevNs = nowNs;
      const prev = lastPhase;
      lastPhase = phase;
      if (prev) breakdown[prev] = (breakdown[prev] ?? 0) + actualPhaseMs;
      const reportedPhaseMs = Math.round(eventPhaseMsOverride ?? actualPhaseMs);
      const payload: RhsRunPhasePayload = {
        phase,
        label,
        elapsedMs: Math.round(elapsedMs),
        phaseMs: reportedPhaseMs,
        ...(detail ? { detail } : {}),
      };
      console.log(
        `[rhs-run] runId=${runId} kind=${kind} phase=${phase} elapsedMs=${payload.elapsedMs} phaseMs=${reportedPhaseMs}${detail ? ` detail=${detail}` : ""}`,
      );
      emit({ runId, sessionId, targetNodeId, kind, type: "phase", payload });
    },
    summary() {
      const totalMs = Math.round(Number(process.hrtime.bigint() - startNs) / 1_000_000);
      const rounded = Object.fromEntries(
        Object.entries(breakdown).map(([k, v]) => [k, Math.round(v)]),
      );
      console.log(
        `[rhs-run-summary] runId=${runId} kind=${kind} totalMs=${totalMs} breakdown=${JSON.stringify(rounded)}`,
      );
    },
    lastPhase() {
      return lastPhase;
    },
  };
}

export function isApiKeyConfigured(): boolean {
  return Boolean(process.env.CURSOR_API_KEY && process.env.CURSOR_API_KEY.trim());
}

function requireApiKey(): string {
  const key = process.env.CURSOR_API_KEY;
  if (!key || !key.trim()) {
    throw new HttpError(503, "CURSOR_API_KEY is not set on the server", {
      code: "NO_API_KEY",
    });
  }
  return key;
}

function emit(event: RhsRunEvent): void {
  runEvents.emit("event", event);
  runEvents.emit(`session:${event.sessionId}`, event);
}

export interface RunActionInput {
  sessionId: string;
  targetNodeId: string;
  kind: RhsRunKind;
  parentRunId?: number | null;
  itemId?: string | null;
  userFeedback?: string | null;
}

export interface RunActionResult {
  runId: number;
  completion: Promise<RhsRunRow>;
}

export function runAction(input: RunActionInput): RunActionResult {
  ensureNoRunningRun(input.sessionId);
  const session = ensureSessionReady(input.sessionId);
  const refinement = requireInProgressRefinement(input.sessionId, input.targetNodeId);
  requireApiKey();

  const prompt = buildPrompt(session, refinement, input);
  const runId = insertRhsRun({
    sessionId: input.sessionId,
    targetNodeId: input.targetNodeId,
    parentRunId: input.parentRunId ?? null,
    agentId: "(pending)",
    sdkRunId: "(pending)",
    kind: input.kind,
    itemId: input.itemId ?? null,
  });

  const completion = executeRun(runId, session, input, prompt);
  return { runId, completion };
}

async function executeRun(
  runId: number,
  session: SessionView,
  input: RunActionInput,
  prompt: string,
): Promise<RhsRunRow> {
  const apiKey = requireApiKey();
  let agent: SDKAgent | null = null;
  let run: Run | null = null;
  emit({
    runId,
    sessionId: input.sessionId,
    targetNodeId: input.targetNodeId,
    kind: input.kind,
    type: "started",
  });
  const tracker = createPhaseTracker(
    runId,
    input.sessionId,
    input.targetNodeId,
    input.kind,
  );
  activePhaseTrackers.set(runId, tracker);
  tracker.mark("queued", "Queued");
  const collectedText: string[] = [];
  try {
    tracker.mark("spawning_agent", "Spawning agent");
    agent = await Agent.create({
      apiKey,
      model: { id: session.modelId },
      local: {
        cwd: session.synthesisWorktree,
        settingSources: ["plugins"],
      },
    });
    tracker.mark("agent_ready", "Agent ready");
    tracker.mark("sending_prompt", "Sending prompt");
    run = await agent.send(prompt);
    activeRuns.set(runId, { agent, run });
    tracker.mark("awaiting_first_message", "Awaiting first message");

    const toolStartNs = new Map<string, bigint>();
    let firstMessageSeen = false;
    const streamPromise = (async () => {
      for await (const message of run!.stream()) {
        if (!firstMessageSeen) {
          firstMessageSeen = true;
          tracker.mark("streaming", "Streaming");
        }
        captureAssistantText(message, collectedText);
        applyMessageToTracker(tracker, message, toolStartNs);
        emit({
          runId,
          sessionId: input.sessionId,
          targetNodeId: input.targetNodeId,
          kind: input.kind,
          type: "sdk_message",
          payload: message,
        });
      }
    })();

    const result = await run.wait();
    await streamPromise;
    tracker.mark("finalizing", "Finalizing");

    const finalText = collectedText.join("\n").trim();
    const parsed = parseResult(input.kind, finalText, result.result);
    setRhsRunFinished(runId, "finished", JSON.stringify(parsed));
    emit({
      runId,
      sessionId: input.sessionId,
      targetNodeId: input.targetNodeId,
      kind: input.kind,
      type: "finished",
      payload: parsed,
    });
    tracker.mark("finished", "Finished");
    tracker.summary();
    return getRhsRun(runId)!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setRhsRunFinished(runId, "error", JSON.stringify({ error: message }));
    emit({
      runId,
      sessionId: input.sessionId,
      targetNodeId: input.targetNodeId,
      kind: input.kind,
      type: "error",
      payload: { error: message },
    });
    tracker.mark("error", "Error", message.slice(0, 200));
    tracker.summary();
    return getRhsRun(runId)!;
  } finally {
    activeRuns.delete(runId);
    activePhaseTrackers.delete(runId);
    if (agent) {
      try {
        await agent.close();
      } catch {}
    }
  }
}

function applyMessageToTracker(
  tracker: PhaseTracker,
  message: SDKMessage,
  toolStartNs: Map<string, bigint>,
): void {
  if (message.type === "tool_call") {
    if (message.status === "running") {
      toolStartNs.set(message.call_id, process.hrtime.bigint());
      tracker.mark("tool_running", `Tool: ${message.name}`, message.call_id);
      return;
    }
    if (message.status === "completed" || message.status === "error") {
      const startedAt = toolStartNs.get(message.call_id);
      const overrideMs = startedAt
        ? Number(process.hrtime.bigint() - startedAt) / 1_000_000
        : undefined;
      toolStartNs.delete(message.call_id);
      tracker.mark(
        "tool_done",
        `Tool: ${message.name} (${message.status})`,
        message.call_id,
        overrideMs,
      );
    }
    return;
  }
  if (message.type === "thinking") {
    if (tracker.lastPhase() !== "thinking") {
      tracker.mark("thinking", "Thinking");
    }
  }
}

export async function cancelRun(runId: number): Promise<void> {
  const active = activeRuns.get(runId);
  if (!active) {
    const row = getRhsRun(runId);
    if (!row) throw new HttpError(404, `Run ${runId} not found`);
    if (row.status === "running") {
      setRhsRunFinished(runId, "cancelled", JSON.stringify({ cancelled: true }));
      emit({
        runId,
        sessionId: row.session_id,
        targetNodeId: row.target_node_id,
        kind: row.kind,
        type: "cancelled",
      });
      const tracker = activePhaseTrackers.get(runId);
      if (tracker) {
        tracker.mark("cancelled", "Cancelled");
        tracker.summary();
      }
    }
    return;
  }
  try {
    await active.run.cancel();
  } catch {}
  setRhsRunFinished(runId, "cancelled", JSON.stringify({ cancelled: true }));
  const row = getRhsRun(runId)!;
  rollbackSynthesisForInProgressRefinement(row.session_id);
  emit({
    runId,
    sessionId: row.session_id,
    targetNodeId: row.target_node_id,
    kind: row.kind,
    type: "cancelled",
  });
  const tracker = activePhaseTrackers.get(runId);
  if (tracker) {
    tracker.mark("cancelled", "Cancelled");
    tracker.summary();
  }
}

export interface ConstructAllRemainingResult {
  runIds: number[];
  status: "completed" | "halted";
  haltedReason?: string;
}

export async function constructAllRemaining(
  sessionId: string,
  targetNodeId: string,
): Promise<ConstructAllRemainingResult> {
  const runIds: number[] = [];
  while (true) {
    const refinement = requireInProgressRefinement(sessionId, targetNodeId);
    const plan = refinement.semanticPlan as
      | { items: Array<{ id: string }> }
      | { intermediateItems: Array<{ id: string }> }
      | null;
    if (!plan) {
      throw new HttpError(409, "No accepted plan for this edge");
    }
    const items =
      "items" in plan
        ? plan.items
        : (plan as { intermediateItems: Array<{ id: string }> }).intermediateItems;
    const constructedItemIds = collectConstructedItemIds(sessionId, targetNodeId);
    const next = items.find((item) => !constructedItemIds.has(item.id));
    if (!next) {
      emit({
        runId: 0,
        sessionId,
        targetNodeId,
        kind: "construct",
        type: "loop_progress",
        payload: { status: "completed", runIds },
      });
      return { runIds, status: "completed" };
    }

    let action: RunActionResult;
    const iterationStartNs = process.hrtime.bigint();
    try {
      action = runAction({
        sessionId,
        targetNodeId,
        kind: "construct",
        itemId: next.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { runIds, status: "halted", haltedReason: message };
    }
    runIds.push(action.runId);
    const iteration = runIds.length;
    emit({
      runId: action.runId,
      sessionId,
      targetNodeId,
      kind: "construct",
      type: "loop_progress",
      payload: { itemId: next.id, position: iteration },
    });
    const finished = await action.completion;
    const runMs = Math.round(
      Number(process.hrtime.bigint() - iterationStartNs) / 1_000_000,
    );
    if (finished.status !== "finished") {
      return {
        runIds,
        status: "halted",
        haltedReason: `Run ${finished.id} ended with status ${finished.status}`,
      };
    }
    const result = finished.result_json
      ? (JSON.parse(finished.result_json) as { ok?: boolean; reason?: string })
      : null;
    if (result && result.ok === false) {
      return {
        runIds,
        status: "halted",
        haltedReason: result.reason ?? "subagent reported BLOCKED",
      };
    }
    try {
      const checkpointStartNs = process.hrtime.bigint();
      const parentNodeId = getSynthesisHeadNodeIdOrBefore(sessionId, targetNodeId);
      const node = checkpointSynthesisWorktree({
        sessionId,
        parentNodeId,
        title: next.id,
        message: null,
        metadata: { kind: "plan-item", planItemId: next.id },
      });
      advanceSynthesisHead(sessionId, targetNodeId, node.nodeId);
      const checkpointMs = Math.round(
        Number(process.hrtime.bigint() - checkpointStartNs) / 1_000_000,
      );
      console.log(
        `[rhs-construct-loop] iteration=${iteration} itemId=${next.id} runMs=${runMs} checkpointMs=${checkpointMs}`,
      );
      emit({
        runId: action.runId,
        sessionId,
        targetNodeId,
        kind: "construct",
        type: "loop_progress",
        payload: {
          itemId: next.id,
          checkpointedNodeId: node.nodeId,
          runMs,
          checkpointMs,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { runIds, status: "halted", haltedReason: message };
    }
  }
}

function collectConstructedItemIds(
  sessionId: string,
  targetNodeId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const nodeId of getIntermediateNodeIds(sessionId, targetNodeId)) {
    const node = getNode(sessionId, nodeId);
    const md = node.metadata as { kind?: string; planItemId?: string } | null;
    if (md?.kind === "plan-item" && md.planItemId) ids.add(md.planItemId);
  }
  return ids;
}

function captureAssistantText(message: SDKMessage, sink: string[]): void {
  if (message.type !== "assistant") return;
  for (const block of message.message.content) {
    if (block.type === "text") sink.push(block.text);
  }
}

interface ParsedRunOutput {
  ok: boolean;
  data?: unknown;
  text?: string;
  reason?: string;
  rawResult?: string;
}

function parseResult(
  kind: RhsRunKind,
  finalAssistantText: string,
  rawResult: string | undefined,
): ParsedRunOutput {
  if (kind === "survey" || kind === "plan") {
    const json =
      extractFencedJson(finalAssistantText) ??
      (rawResult ? extractFencedJson(rawResult) : null);
    if (!json) {
      return {
        ok: false,
        text: finalAssistantText,
        reason: "no fenced JSON block in subagent output",
        rawResult,
      };
    }
    return { ok: true, data: json, text: finalAssistantText, rawResult };
  }
  const trimmed = finalAssistantText.trim();
  const lastLine = trimmed.split(/\r?\n/).pop()?.trim() ?? "";
  if (lastLine === "OK") {
    return { ok: true, text: trimmed, rawResult };
  }
  if (lastLine.startsWith("BLOCKED:")) {
    return {
      ok: false,
      reason: lastLine.slice("BLOCKED:".length).trim(),
      text: trimmed,
      rawResult,
    };
  }
  return {
    ok: false,
    reason: `expected 'OK' or 'BLOCKED: ...' as the final line; got: ${lastLine.slice(0, 200)}`,
    text: trimmed,
    rawResult,
  };
}

function extractFencedJson(text: string): unknown | null {
  const match = text.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]!);
  } catch {
    return null;
  }
}

export function acceptSurveyFromRun(
  sessionId: string,
  targetNodeId: string,
  runId: number,
): EdgeRefinementView {
  const row = getRhsRun(runId);
  if (!row || row.session_id !== sessionId || row.target_node_id !== targetNodeId) {
    throw new HttpError(404, `Run ${runId} not found for this edge`);
  }
  if (row.kind !== "survey") {
    throw new HttpError(400, `Run ${runId} is not a survey run`);
  }
  if (row.status !== "finished") {
    throw new HttpError(409, `Run ${runId} did not finish successfully`);
  }
  const parsed = row.result_json ? (JSON.parse(row.result_json) as ParsedRunOutput) : null;
  if (!parsed?.ok || !parsed.data) {
    throw new HttpError(409, `Survey run ${runId} produced no parseable output`);
  }
  return setAcceptedSurveyForEdge(sessionId, targetNodeId, parsed.data);
}

export function acceptPlanFromRun(
  sessionId: string,
  targetNodeId: string,
  runId: number,
): EdgeRefinementView {
  const row = getRhsRun(runId);
  if (!row || row.session_id !== sessionId || row.target_node_id !== targetNodeId) {
    throw new HttpError(404, `Run ${runId} not found for this edge`);
  }
  if (row.kind !== "plan") {
    throw new HttpError(400, `Run ${runId} is not a plan run`);
  }
  if (row.status !== "finished") {
    throw new HttpError(409, `Run ${runId} did not finish successfully`);
  }
  const parsed = row.result_json ? (JSON.parse(row.result_json) as ParsedRunOutput) : null;
  if (!parsed?.ok || !parsed.data) {
    throw new HttpError(409, `Plan run ${runId} produced no parseable output`);
  }
  return setAcceptedPlanForEdge(sessionId, targetNodeId, parsed.data);
}

function requireInProgressRefinement(
  sessionId: string,
  targetNodeId: string,
): EdgeRefinementView {
  const refinement = getEdgeRefinement(sessionId, targetNodeId);
  if (!refinement || refinement.status !== "in_progress") {
    throw new HttpError(
      409,
      `No in-progress refinement for edge ${targetNodeId}; call /begin first`,
    );
  }
  return refinement;
}

function buildPrompt(
  session: SessionView,
  refinement: EdgeRefinementView,
  input: RunActionInput,
): string {
  const target = getNode(session.id, refinement.targetNodeId);
  if (!target.parentNodeId) {
    throw new HttpError(500, "Refinement target has no parent");
  }
  const before = getNode(session.id, target.parentNodeId);
  switch (input.kind) {
    case "survey":
      return surveyPrompt(refinement, before, target, input);
    case "plan":
      return planPrompt(session, refinement, before, target, input);
    case "construct":
      return constructPrompt(session, refinement, before, target, input);
  }
}

function priorRunOutputForEdge(
  sessionId: string,
  targetNodeId: string,
  parentRunId: number | null,
): unknown | null {
  if (parentRunId == null) return null;
  const row = getRhsRun(parentRunId);
  if (!row || row.session_id !== sessionId || row.target_node_id !== targetNodeId)
    return null;
  if (!row.result_json) return null;
  const parsed = JSON.parse(row.result_json) as ParsedRunOutput;
  if (!parsed.ok || !parsed.data) return null;
  return parsed.data;
}

function fenced(value: unknown): string {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

function surveyPrompt(
  refinement: EdgeRefinementView,
  before: VirtualNodeView,
  target: VirtualNodeView,
  input: RunActionInput,
): string {
  const priorSurvey = priorRunOutputForEdge(
    refinement.sessionId,
    refinement.targetNodeId,
    input.parentRunId ?? null,
  );
  const inputs = [
    `BeforeTree: ${before.treeId}`,
    `TargetTree: ${target.treeId}`,
  ];
  if (priorSurvey) inputs.push(`PriorSurveyJson:\n${fenced(priorSurvey)}`);
  if (input.userFeedback) inputs.push(`UserFeedback: ${input.userFeedback}`);
  return [
    "Use the rhs-change-surveyor subagent to produce a structured ChangeSurvey for this edge.",
    "",
    "Inputs to pass through to the subagent:",
    ...inputs,
    "",
    "Return ONLY the subagent's fenced JSON block as your final assistant message.",
  ].join("\n");
}

function planPrompt(
  session: SessionView,
  refinement: EdgeRefinementView,
  before: VirtualNodeView,
  target: VirtualNodeView,
  input: RunActionInput,
): string {
  if (refinement.mode === "partition") {
    if (!refinement.changeSurvey) {
      throw new HttpError(
        409,
        "Cannot run plan in partitioning mode: survey has not been accepted for this edge",
      );
    }
    const priorPlan = priorRunOutputForEdge(
      session.id,
      refinement.targetNodeId,
      input.parentRunId ?? null,
    );
    const inputs = [
      `BeforeTree: ${before.treeId}`,
      `TargetTree: ${target.treeId}`,
      `ChangeSurveyJson:\n${fenced(refinement.changeSurvey)}`,
    ];
    if (priorPlan) inputs.push(`PriorPlanJson:\n${fenced(priorPlan)}`);
    if (input.userFeedback) inputs.push(`UserFeedback: ${input.userFeedback}`);
    return [
      "Use the rhs-semantic-partitioner subagent to produce a SemanticPlan for this edge.",
      "",
      "Inputs to pass through to the subagent:",
      ...inputs,
      "",
      "Return ONLY the subagent's fenced JSON block as your final assistant message.",
    ].join("\n");
  }

  if (!refinement.userConcern?.trim()) {
    throw new HttpError(409, "userConcern is required for synthesis-mode refinements");
  }
  const priorPlan = priorRunOutputForEdge(
    session.id,
    refinement.targetNodeId,
    input.parentRunId ?? null,
  );
  const edgeDiff = unifiedDiff(before.treeId, target.treeId);
  const inputs = [
    `BeforeCommit: ${before.commitSha}`,
    `TargetCommit: ${target.commitSha}`,
    `UserConcern: ${refinement.userConcern}`,
    `EdgeDiff (informational only):\n\`\`\`diff\n${edgeDiff}\n\`\`\``,
  ];
  if (refinement.changeSurvey)
    inputs.push(`ChangeSurveyJson:\n${fenced(refinement.changeSurvey)}`);
  if (priorPlan) inputs.push(`PriorPlanJson:\n${fenced(priorPlan)}`);
  if (input.userFeedback) inputs.push(`UserFeedback: ${input.userFeedback}`);
  return [
    "Use the rhs-edge-refinement-planner subagent to produce an EdgeRefinementPlan.",
    "",
    "Inputs to pass through to the subagent:",
    ...inputs,
    "",
    "Return ONLY the subagent's fenced JSON block as your final assistant message.",
  ].join("\n");
}

function constructPrompt(
  session: SessionView,
  refinement: EdgeRefinementView,
  before: VirtualNodeView,
  target: VirtualNodeView,
  input: RunActionInput,
): string {
  if (!input.itemId) throw new HttpError(400, "itemId is required for construct runs");
  if (!refinement.semanticPlan) {
    throw new HttpError(409, "No accepted plan for this edge");
  }
  const previousCommit = getSynthesisHeadCommit(session.id, refinement.targetNodeId);

  if (refinement.mode === "partition") {
    if (!refinement.changeSurvey)
      throw new HttpError(409, "Survey has not been accepted for this edge");
    const plan = refinement.semanticPlan as {
      items: Array<{ id: string; title?: string; intent?: string; dependencies?: string[] }>;
    };
    const item = plan.items.find((it) => it.id === input.itemId);
    if (!item) throw new HttpError(404, `Plan item ${input.itemId} not found`);
    return [
      "Use the rhs-node-constructor subagent to implement ONE plan item by editing the synthesis worktree.",
      "",
      `SynthesisWorktree: ${session.synthesisWorktree}`,
      `PreviousCommit: ${previousCommit}`,
      `TargetTree: ${target.treeId}`,
      `PlanItemJson:\n${fenced(item)}`,
      `AcceptedPlanJson:\n${fenced(plan)}`,
      `ChangeSurveyJson:\n${fenced(refinement.changeSurvey)}`,
      "",
      "Do not commit; the backend will checkpoint the worktree after you return.",
      "Return EXACTLY one line: 'OK' on success or 'BLOCKED: <reason>' on failure.",
    ].join("\n");
  }

  const plan = refinement.semanticPlan as {
    intermediateItems: Array<{
      id: string;
      intent: string;
      dependencies: string[];
      message: string;
    }>;
  };
  const item = plan.intermediateItems.find((it) => it.id === input.itemId);
  if (!item) throw new HttpError(404, `Intermediate item ${input.itemId} not found`);
  return [
    "Use the rhs-edge-intermediate-constructor subagent to implement ONE intermediate item.",
    "",
    `SynthesisWorktree: ${session.synthesisWorktree}`,
    `PreviousCommit: ${previousCommit}`,
    `TargetCommit: ${target.commitSha}`,
    `IntermediateItemJson:\n${fenced(item)}`,
    `RefinementPlanJson:\n${fenced(plan)}`,
    "",
    "Do not commit; the backend will checkpoint the worktree after you return.",
    "Return EXACTLY one line: 'OK' on success or 'BLOCKED: <reason>' on failure.",
  ].join("\n");
}

export function ensureNoActiveRunsForWorker(_workerName: string): void {
  // worker delete tears down sessions and cancels in-flight runs; DB cascade handles row cleanup.
}

export function listRunsForEdge(
  sessionId: string,
  targetNodeId: string,
): RhsRunRow[] {
  return listRhsRunsForEdge(sessionId, targetNodeId);
}
