import { Router, type RequestHandler } from "express";
import {
  appendMessage,
  create,
  list,
  read,
  readChat,
  remove,
  update,
} from "../services/issues.js";
import { moveBranch } from "../services/move-branch.js";
import type {
  ChatMessageInput,
  CreateInput,
  IssuePatch,
} from "../schemas.js";

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

issuesRouter.get(
  "/:id/chat",
  asyncRoute((req, res) => {
    res.json(readChat(req.params.id));
  }),
);

issuesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const record = await create(req.body as CreateInput);
    res.status(201).json(record);
  }),
);

issuesRouter.post(
  "/:id/messages",
  asyncRoute(async (req, res) => {
    const message = await appendMessage(req.params.id, req.body as ChatMessageInput);
    res.status(201).json(message);
  }),
);

issuesRouter.post(
  "/:id/move-branch",
  asyncRoute(async (req, res) => {
    const target = (req.body as { target?: unknown })?.target;
    if (typeof target !== "string" || !target) {
      res.status(400).json({ error: "target is required" });
      return;
    }
    const result = await moveBranch(req.params.id, target);
    res.json(result);
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
