import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";
import { logger } from "../../config/logger.js";
import { isProduction } from "../../config/env.js";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Risorsa non trovata: ${req.method} ${req.originalUrl}`,
    },
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    logger.warn({ err: error, code: error.code }, error.message);
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  logger.error({ err: error }, "Errore non gestito");

  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: isProduction
        ? "Errore interno del server"
        : error instanceof Error
          ? error.message
          : String(error),
    },
  });
}
