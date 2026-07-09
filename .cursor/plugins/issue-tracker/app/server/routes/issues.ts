import { Router, type RequestHandler } from "express";
import { create, list, read, remove, update } from "../services/issues.js";
import type { CreateInput, IssuePatch } from "../schemas.js";

const asyncRoute =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

export const issuesRouter = Router();

issuesRouter.get("/", (_req, res) => {
  res.json(list());
});

issuesRouter.get(
  "/:id",
  asyncRoute((req, res) => {
    res.json(read(req.params.id));
  }),
);

issuesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const record = await create(req.body as CreateInput);
    res.status(201).json(record);
  }),
);

issuesRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const record = await update(req.params.id, req.body as IssuePatch);
    res.json(record);
  }),
);

issuesRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const result = await remove(req.params.id);
    res.json(result);
  }),
);
