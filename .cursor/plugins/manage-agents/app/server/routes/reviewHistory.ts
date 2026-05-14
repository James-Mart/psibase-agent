import { Router } from "express";
import { z } from "zod";
import { Cursor } from "@cursor/sdk";
import { asyncHandler } from "../errors.js";
import { validate, workerNameParam } from "../schemas.js";
import { requireWorkerDir } from "../services/workers.js";
import { getCurrentBranch } from "../services/git.js";
import {
  acceptPlanFromRun,
  acceptSurveyFromRun,
  cancelRun,
  constructAllRemaining,
  isApiKeyConfigured,
  listRunsForEdge,
  runAction,
  runEvents,
} from "../services/reviewHistory/agents.js";
import {
  abandonEdgeRefinement,
  beginEdgeRefinement,
  checkpointSynthesisWorktree,
  completeEdgeRefinement,
  createSession,
  deleteSession,
  exportActiveHistoryToBranch,
  getActiveChain,
  getChangedFilesBetweenNodes,
  getEdgeRefinement,
  getInProgressRefinement,
  getIntermediateNodeIds,
  getNode,
  getNodeDiff,
  getNodeFile,
  getNodeGraph,
  getSessionById,
  getSessionForWorkerBranch,
  updateModelId,
  validateActiveHeadEqualsFinal,
  verifyExportMatchesFinal,
  type SessionView,
} from "../services/reviewHistory/sessions.js";
import { getRhsRun } from "../db.js";
import { HttpError } from "../errors.js";

const sessionIdParam = z.object({ sessionId: z.string().uuid() });
const nodeIdParam = sessionIdParam.extend({ nodeId: z.string().uuid() });
const edgeParam = sessionIdParam.extend({ targetNodeId: z.string().uuid() });
const edgeRunIdParam = edgeParam.extend({
  runId: z.coerce.number().int().positive(),
});

const createSessionBody = z.object({
  baseRef: z.string().min(1),
  modelId: z.string().min(1).optional(),
});

const modelBody = z.object({ modelId: z.string().min(1) });

const refinementMode = z.enum(["partition", "synthesis"]);

const beginRefinementBody = z.object({
  mode: refinementMode,
  userConcern: z.string().optional().nullable(),
});

const startRunBody = z.object({
  kind: z.enum(["survey", "plan", "construct"]),
  parentRunId: z.number().int().positive().optional(),
  itemId: z.string().min(1).optional(),
  userFeedback: z.string().optional(),
});

const acceptRunBody = z.object({ runId: z.number().int().positive() });

const completeBody = z.object({
  intermediateNodeIds: z.array(z.string().uuid()).min(1),
});

const exportBody = z.object({
  branchName: z.string().min(1).regex(/^[a-zA-Z0-9._\/-]+$/),
  force: z.boolean().optional(),
});

const verifyBody = z.object({
  branchName: z.string().min(1).regex(/^[a-zA-Z0-9._\/-]+$/),
});

const checkpointBody = z.object({
  parentNodeId: z.string().uuid(),
  title: z.string().min(1),
  message: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  setAsActiveHead: z.boolean().optional(),
});

const fileQuery = z.object({ path: z.string().min(1) });

function annotateSession(session: SessionView, currentBranch: string): SessionView & {
  workerCurrentBranch: string;
  isOnLockedBranch: boolean;
} {
  return {
    ...session,
    workerCurrentBranch: currentBranch,
    isOnLockedBranch: session.workerBranch === currentBranch,
  };
}

function requireSession(sessionId: string): SessionView {
  return getSessionById(sessionId);
}

export const reviewHistoryWorkerRouter = Router();

reviewHistoryWorkerRouter.get(
  "/:name/review-history/session",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    const dir = requireWorkerDir(req.params.name);
    const branch = getCurrentBranch(dir) || "(unknown)";
    const session = getSessionForWorkerBranch(req.params.name, branch);
    res.json({
      currentBranch: branch,
      session: session ? annotateSession(session, branch) : null,
    });
  }),
);

reviewHistoryWorkerRouter.post(
  "/:name/review-history/session",
  validate({ params: workerNameParam, body: createSessionBody }),
  asyncHandler((req, res) => {
    const dir = requireWorkerDir(req.params.name);
    const sourceRef = getCurrentBranch(dir);
    if (!sourceRef || sourceRef === "(unknown)") {
      throw new HttpError(
        400,
        "Worker is on an unknown or detached branch; cannot create review-history session",
      );
    }
    const session = createSession({
      workerName: req.params.name,
      workerDir: dir,
      baseRef: req.body.baseRef,
      sourceRef,
      modelId: req.body.modelId,
    });
    res.status(201).json(annotateSession(session, session.workerBranch));
  }),
);

reviewHistoryWorkerRouter.delete(
  "/:name/review-history/session",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    const dir = requireWorkerDir(req.params.name);
    const branch = getCurrentBranch(dir) || "(unknown)";
    const session = getSessionForWorkerBranch(req.params.name, branch);
    if (session) {
      deleteSession(session.id);
    }
    res.json({ ok: true });
  }),
);

reviewHistoryWorkerRouter.patch(
  "/:name/review-history/session/model",
  validate({ params: workerNameParam, body: modelBody }),
  asyncHandler((req, res) => {
    const dir = requireWorkerDir(req.params.name);
    const branch = getCurrentBranch(dir) || "(unknown)";
    const session = getSessionForWorkerBranch(req.params.name, branch);
    if (!session) throw new HttpError(404, "No session for this worker/branch");
    const updated = updateModelId(session.id, req.body.modelId);
    res.json(annotateSession(updated, branch));
  }),
);

export const reviewHistoryRouter = Router();

reviewHistoryRouter.get(
  "/api-key-status",
  asyncHandler((_req, res) => {
    res.json({ ok: isApiKeyConfigured() });
  }),
);

reviewHistoryRouter.get(
  "/models",
  asyncHandler(async (_req, res) => {
    if (!isApiKeyConfigured()) {
      throw new HttpError(503, "CURSOR_API_KEY is not set on the server", {
        code: "NO_API_KEY",
      });
    }
    const apiKey = process.env.CURSOR_API_KEY!;
    const models = await Cursor.models.list({ apiKey });
    res.json({ items: models });
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId",
  validate({ params: sessionIdParam }),
  asyncHandler((req, res) => {
    res.json(requireSession(req.params.sessionId));
  }),
);

reviewHistoryRouter.delete(
  "/sessions/:sessionId",
  validate({ params: sessionIdParam }),
  asyncHandler((req, res) => {
    deleteSession(req.params.sessionId);
    res.json({ ok: true });
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/active-chain",
  validate({ params: sessionIdParam }),
  asyncHandler((req, res) => {
    res.json(getActiveChain(req.params.sessionId));
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/graph",
  validate({ params: sessionIdParam }),
  asyncHandler((req, res) => {
    res.json(getNodeGraph(req.params.sessionId));
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/nodes/:nodeId/diff",
  validate({ params: nodeIdParam }),
  asyncHandler((req, res) => {
    res.json(getNodeDiff(req.params.sessionId, req.params.nodeId));
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/nodes/:nodeId/changed-files",
  validate({ params: nodeIdParam }),
  asyncHandler((req, res) => {
    const { sessionId, nodeId } = req.params;
    const session = requireSession(sessionId);
    const node = getNode(sessionId, nodeId);
    const fromNodeId = node.parentNodeId ?? session.baseNodeId;
    res.json({
      files: getChangedFilesBetweenNodes(sessionId, fromNodeId, nodeId),
    });
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/nodes/:nodeId/file",
  validate({ params: nodeIdParam, query: fileQuery }),
  asyncHandler((req, res) => {
    const path = (req.query as unknown as { path: string }).path;
    const content = getNodeFile(req.params.sessionId, req.params.nodeId, path);
    if (content == null) {
      res.status(404).json({ error: "file not found at node" });
      return;
    }
    res.type("text/plain").send(content);
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/validate-head",
  validate({ params: sessionIdParam }),
  asyncHandler((req, res) => {
    res.json(validateActiveHeadEqualsFinal(req.params.sessionId));
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/in-progress-refinement",
  validate({ params: sessionIdParam }),
  asyncHandler((req, res) => {
    res.json(getInProgressRefinement(req.params.sessionId));
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/runs/:runId",
  validate({
    params: sessionIdParam.extend({
      runId: z.coerce.number().int().positive(),
    }),
  }),
  asyncHandler((req, res) => {
    const run = getRhsRun(Number(req.params.runId));
    if (!run || run.session_id !== req.params.sessionId) {
      throw new HttpError(404, `Run ${req.params.runId} not found`);
    }
    res.json(run);
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/checkpoint",
  validate({ params: sessionIdParam, body: checkpointBody }),
  asyncHandler((req, res) => {
    res.json(
      checkpointSynthesisWorktree({
        sessionId: req.params.sessionId,
        parentNodeId: req.body.parentNodeId,
        title: req.body.title,
        message: req.body.message ?? null,
        metadata: req.body.metadata,
        setAsActiveHead: req.body.setAsActiveHead,
      }),
    );
  }),
);

reviewHistoryRouter.get(
  "/sessions/:sessionId/edges/:targetNodeId",
  validate({ params: edgeParam }),
  asyncHandler((req, res) => {
    const { sessionId, targetNodeId } = req.params;
    res.json({
      refinement: getEdgeRefinement(sessionId, targetNodeId),
      runs: listRunsForEdge(sessionId, targetNodeId),
      intermediateNodeIds: getIntermediateNodeIds(sessionId, targetNodeId),
    });
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/edges/:targetNodeId/begin",
  validate({ params: edgeParam, body: beginRefinementBody }),
  asyncHandler((req, res) => {
    const ctx = beginEdgeRefinement(
      req.params.sessionId,
      req.params.targetNodeId,
      req.body.mode,
      req.body.userConcern ?? null,
    );
    res.status(201).json(ctx);
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/edges/:targetNodeId/runs",
  validate({ params: edgeParam, body: startRunBody }),
  asyncHandler((req, res) => {
    const { runId } = runAction({
      sessionId: req.params.sessionId,
      targetNodeId: req.params.targetNodeId,
      kind: req.body.kind,
      parentRunId: req.body.parentRunId ?? null,
      itemId: req.body.itemId ?? null,
      userFeedback: req.body.userFeedback ?? null,
    });
    res.status(202).json({ runId });
  }),
);

reviewHistoryRouter.delete(
  "/sessions/:sessionId/edges/:targetNodeId/runs/:runId",
  validate({ params: edgeRunIdParam }),
  asyncHandler(async (req, res) => {
    await cancelRun(Number(req.params.runId));
    res.json({ ok: true });
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/edges/:targetNodeId/survey/accept",
  validate({ params: edgeParam, body: acceptRunBody }),
  asyncHandler((req, res) => {
    res.json(
      acceptSurveyFromRun(
        req.params.sessionId,
        req.params.targetNodeId,
        req.body.runId,
      ),
    );
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/edges/:targetNodeId/plan/accept",
  validate({ params: edgeParam, body: acceptRunBody }),
  asyncHandler((req, res) => {
    res.json(
      acceptPlanFromRun(
        req.params.sessionId,
        req.params.targetNodeId,
        req.body.runId,
      ),
    );
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/edges/:targetNodeId/construct-all-remaining",
  validate({ params: edgeParam }),
  asyncHandler((req, res) => {
    void constructAllRemaining(req.params.sessionId, req.params.targetNodeId);
    res.status(202).json({ ok: true });
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/edges/:targetNodeId/complete",
  validate({ params: edgeParam, body: completeBody }),
  asyncHandler((req, res) => {
    res.json(
      completeEdgeRefinement(
        req.params.sessionId,
        req.params.targetNodeId,
        req.body.intermediateNodeIds,
      ),
    );
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/edges/:targetNodeId/abandon",
  validate({ params: edgeParam }),
  asyncHandler((req, res) => {
    abandonEdgeRefinement(req.params.sessionId, req.params.targetNodeId);
    res.json({ ok: true });
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/export",
  validate({ params: sessionIdParam, body: exportBody }),
  asyncHandler((req, res) => {
    res.json(
      exportActiveHistoryToBranch({
        sessionId: req.params.sessionId,
        branchName: req.body.branchName,
        force: req.body.force,
      }),
    );
  }),
);

reviewHistoryRouter.post(
  "/sessions/:sessionId/verify",
  validate({ params: sessionIdParam, body: verifyBody }),
  asyncHandler((req, res) => {
    res.json(verifyExportMatchesFinal(req.params.sessionId, req.body.branchName));
  }),
);

const SSE_KEEPALIVE_MS = 30_000;

reviewHistoryRouter.get(
  "/sessions/:sessionId/events",
  validate({ params: sessionIdParam }),
  (req, res) => {
    requireSession(req.params.sessionId);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    res.write(":ok\n\n");

    const channel = `session:${req.params.sessionId}`;
    const onEvent = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    runEvents.on(channel, onEvent);

    const keepalive = setInterval(() => res.write(":ka\n\n"), SSE_KEEPALIVE_MS);
    req.on("close", () => {
      clearInterval(keepalive);
      runEvents.off(channel, onEvent);
      res.end();
    });
  },
);
