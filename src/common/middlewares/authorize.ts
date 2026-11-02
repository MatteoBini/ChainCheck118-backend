import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";

import { AppError } from "../errors/AppError.js";

/** Da usare dopo authenticate: consente l'accesso solo ai ruoli indicati. */
export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Token mancante"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "FORBIDDEN", "Ruolo non autorizzato per questa operazione"));
      return;
    }
    next();
  };
}
