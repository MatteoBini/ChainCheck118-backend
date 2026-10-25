import { Router } from "express";

import { prisma } from "./db/prisma.js";
import { logger } from "./config/logger.js";

export const routes = Router();

routes.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up" });
  } catch (error) {
    logger.error({ err: error }, "Health check fallito");
    res.status(503).json({ status: "degraded", db: "down" });
  }
});
