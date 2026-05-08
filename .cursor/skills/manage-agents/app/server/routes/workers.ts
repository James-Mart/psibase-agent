import { Router } from "express";
import { asyncHandler } from "../errors.js";
import {
  createWorkerBody,
  noteBody,
  renameWorkerBody,
  statusBody,
  validate,
  workerNameParam,
  type CreateWorkerBody,
  type NoteBody,
  type RenameWorkerBody,
  type StatusBody,
} from "../schemas.js";
import {
  createWorker,
  deleteWorker,
  getWorkerDetails,
  listWorkers,
  renameWorker,
  startAgent,
  stopAgent,
  updateNote,
  updateStatus,
} from "../services/workers.js";

export const workersRouter = Router();

workersRouter.get(
  "/",
  asyncHandler((_req, res) => {
    res.json(listWorkers());
  }),
);

workersRouter.post(
  "/",
  validate({ body: createWorkerBody }),
  asyncHandler((req, res) => {
    const body = req.body as CreateWorkerBody;
    res.json(createWorker(body));
  }),
);

workersRouter.post(
  "/:name/start",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    res.json(startAgent(req.params.name));
  }),
);

workersRouter.post(
  "/:name/stop",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    res.json(stopAgent(req.params.name));
  }),
);

workersRouter.get(
  "/:name/details",
  validate({ params: workerNameParam }),
  asyncHandler((req, res) => {
    res.json(getWorkerDetails(req.params.name));
  }),
);

workersRouter.put(
  "/:name/note",
  validate({ params: workerNameParam, body: noteBody }),
  asyncHandler((req, res) => {
    const { note } = req.body as NoteBody;
    res.json(updateNote(req.params.name, note));
  }),
);

workersRouter.put(
  "/:name/status",
  validate({ params: workerNameParam, body: statusBody }),
  asyncHandler((req, res) => {
    const { status } = req.body as StatusBody;
    res.json(updateStatus(req.params.name, status));
  }),
);

workersRouter.post(
  "/:name/rename",
  validate({ params: workerNameParam, body: renameWorkerBody }),
  asyncHandler((req, res) => {
    const { newName } = req.body as RenameWorkerBody;
    res.json(renameWorker(req.params.name, newName));
  }),
);

workersRouter.delete(
  "/:name",
  validate({ params: workerNameParam }),
  asyncHandler(async (req, res) => {
    res.json(await deleteWorker(req.params.name));
  }),
);
