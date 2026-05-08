import type { RequestHandler } from "express";
import { z, ZodError, type ZodSchema } from "zod";
import { HttpError } from "./errors.js";

const branchNameRe = /^[a-zA-Z0-9._\/-]+$/;
const workerNameRe = /^[a-zA-Z0-9._-]+$/;

export const createWorkerBody = z.object({
  branch: z.string().regex(branchNameRe, "Invalid branch name"),
  sourceBranch: z.string().min(1).optional(),
});

export const renameWorkerBody = z.object({
  newName: z
    .string()
    .regex(
      workerNameRe,
      "Invalid name (alphanumeric, hyphens, underscores, dots only)",
    ),
});

export const noteBody = z.object({
  note: z.string(),
});

export const statusBody = z.object({
  status: z.enum(["active", "blocked", "inactive"]),
});

export const workerNameParam = z.object({
  name: z.string().regex(workerNameRe, "Invalid worker name"),
});

export type CreateWorkerBody = z.infer<typeof createWorkerBody>;
export type RenameWorkerBody = z.infer<typeof renameWorkerBody>;
export type NoteBody = z.infer<typeof noteBody>;
export type StatusBody = z.infer<typeof statusBody>;
export type WorkerNameParam = z.infer<typeof workerNameParam>;

interface ValidateConfig {
  body?: ZodSchema;
  params?: ZodSchema;
}

function formatZodMessage(err: ZodError): string {
  const first = err.issues[0];
  if (!first) return "Invalid request";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export function validate(schemas: ValidateConfig): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body ?? {});
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new HttpError(400, formatZodMessage(err)));
        return;
      }
      next(err);
    }
  };
}
