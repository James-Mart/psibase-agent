import { Router } from "express";
import { asyncHandler } from "../errors.js";
import { REPO_ROOT } from "../config.js";
import { checkBranch, fetchOrigin } from "../services/git.js";

export const gitRouter = Router();

gitRouter.post(
  "/fetch",
  asyncHandler((_req, res) => {
    fetchOrigin(REPO_ROOT);
    res.json({ ok: true });
  }),
);

gitRouter.get(
  "/branch-check",
  asyncHandler((req, res) => {
    const name = req.query.name;
    if (typeof name !== "string" || !name) {
      res.status(400).json({ error: "name query param required" });
      return;
    }
    res.json(checkBranch(REPO_ROOT, name));
  }),
);
