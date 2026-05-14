import { Router } from "express";
import { asyncHandler, HttpError } from "../errors.js";
import { validate, workerNameParam } from "../schemas.js";
import { getDiskStats, getWorktreeDiskSize } from "../services/disk.js";
import { resolveSafeWorkerDir } from "../services/workers.js";
import { existsSync } from "fs";

export const diskRouter = Router();

diskRouter.get(
  "/",
  asyncHandler((_req, res) => {
    res.json(getDiskStats());
  }),
);

diskRouter.get(
  "/:name/size",
  validate({ params: workerNameParam }),
  asyncHandler(async (req, res) => {
    const dir = resolveSafeWorkerDir(req.params.name);
    if (!dir || !existsSync(dir)) {
      throw new HttpError(404, `Worktree ${req.params.name} not found`);
    }
    res.json({ size: await getWorktreeDiskSize(dir) });
  }),
);
