import type { TokenUser } from "../modules/auth/auth.service.js";

declare global {
  namespace Express {
    interface Request {
      user?: TokenUser;
    }
  }
}

export {};
