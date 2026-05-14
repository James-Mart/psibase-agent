import type { ErrorRequestHandler, RequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly extras?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, ...(err.extras ?? {}) });
    return;
  }
  const message =
    err instanceof Error ? err.message : "Internal server error";
  res.status(500).json({ error: message });
};
