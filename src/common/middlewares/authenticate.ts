import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";
import { verifyToken } from "../../modules/auth/auth.service.js";

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    next(new AppError(401, "UNAUTHORIZED", "Token mancante"));
    return;
  }

  try {
    req.user = await verifyToken(header.slice("Bearer ".length).trim());
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Token non valido o scaduto"));
  }
}
