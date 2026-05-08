import { Router } from "express";
import { asyncHandler } from "../errors.js";
import {
  logQuery,
  validate,
  workerNameParam,
  type LogQuery,
} from "../schemas.js";
import {
  buildEvents,
  cancelBuild,
  getBuildStatus,
  listLatestBuilds,
  readBuildLog,
  startBuild,
  type BuildSummary,
} from "../services/builds.js";

export const buildsRouter = Router();

buildsRouter.post(
  "/:name/build",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    res.json(startBuild(req.params.name));
  }),
);

buildsRouter.post(
  "/:name/build/cancel",
  validate({ params: workerNameParam }),
  asyncHandler(async (req, res) => {
    res.json(await cancelBuild(req.params.name));
  }),
);

buildsRouter.get(
  "/:name/build",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    res.json(getBuildStatus(req.params.name));
  }),
);

buildsRouter.get(
  "/:name/build/log",
  validate({ params: workerNameParam, query: logQuery }),
  asyncHandler((req, res) => {
    const { stream, offset, limit } = req.query as unknown as LogQuery;
    res.json(readBuildLog(req.params.name, stream, offset, limit));
  }),
);

export const allBuildsRouter = Router();

allBuildsRouter.get(
  "/",
  asyncHandler((_req, res) => {
    res.json(listLatestBuilds());
  }),
);

const SSE_KEEPALIVE_MS = 30_000;

allBuildsRouter.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(":ok\n\n");

  const onFinished = (summary: BuildSummary) => {
    res.write(`event: finished\ndata: ${JSON.stringify(summary)}\n\n`);
  };
  buildEvents.on("finished", onFinished);

  const keepalive = setInterval(() => res.write(":ka\n\n"), SSE_KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(keepalive);
    buildEvents.off("finished", onFinished);
    res.end();
  });
});
