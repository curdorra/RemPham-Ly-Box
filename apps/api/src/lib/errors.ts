import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Resource") => new HttpError(404, "not_found", `${what} not found`);

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(notFound("Route"));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "validation_error", message: "Invalid request", details: err.issues },
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  // Body-parser errors (oversized upload, malformed JSON) carry their own status.
  if (typeof err?.status === "number" && err.status >= 400 && err.status < 500 && err.expose) {
    res.status(err.status).json({
      error: { code: err.type === "entity.too.large" ? "too_large" : "bad_request", message: err.type === "entity.too.large" ? "That file is too big" : "Invalid request body" },
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
};
