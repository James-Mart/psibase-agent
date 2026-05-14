import { Router } from "express";
import { asyncHandler } from "../errors.js";
import {
  chainLogQuery,
  validate,
  workerNameParam,
  type ChainLogQuery,
} from "../schemas.js";
import {
  cancelChain,
  chainEvents,
  getChainStatus,
  listLatestChainsInfo,
  readChainLog,
  startChain,
  type ChainSummary,
} from "../services/chains.js";

export const chainsRouter = Router();

chainsRouter.post(
  "/:name/chain",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    res.json(startChain(req.params.name));
  }),
);

chainsRouter.post(
  "/:name/chain/cancel",
  validate({ params: workerNameParam }),
  asyncHandler(async (req, res) => {
    res.json(await cancelChain(req.params.name));
  }),
);

chainsRouter.get(
  "/:name/chain",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    res.json(getChainStatus(req.params.name));
  }),
);

chainsRouter.get(
  "/:name/chain/log",
  validate({ params: workerNameParam, query: chainLogQuery }),
  asyncHandler((req, res) => {
    const { phase, stream, offset, limit } = req.query as unknown as ChainLogQuery;
    res.json(readChainLog(req.params.name, phase, stream, offset, limit));
  }),
);

export const allChainsRouter = Router();

allChainsRouter.get(
  "/",
  asyncHandler((_req, res) => {
    res.json(listLatestChainsInfo());
  }),
);

const SSE_KEEPALIVE_MS = 30_000;

allChainsRouter.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(":ok\n\n");

  const onFinished = (summary: ChainSummary) => {
    res.write(`event: finished\ndata: ${JSON.stringify(summary)}\n\n`);
  };
  chainEvents.on("finished", onFinished);

  const keepalive = setInterval(() => res.write(":ka\n\n"), SSE_KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(keepalive);
    chainEvents.off("finished", onFinished);
    res.end();
  });
});
