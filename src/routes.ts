import { Router } from "express";

import { prisma } from "./db/prisma.js";
import { logger } from "./config/logger.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { checklistRoutes } from "./modules/checklists/checklists.routes.js";
import { inspectionRoutes } from "./modules/inspections/inspections.routes.js";
import { recentRoutes } from "./modules/recents/recents.routes.js";
import { vehicleRoutes } from "./modules/vehicles/vehicles.routes.js";

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

routes.use("/auth", authRoutes);
routes.use("/vehicles", vehicleRoutes);
routes.use("/checklists", checklistRoutes);
routes.use("/inspections", inspectionRoutes);
routes.use("/recents", recentRoutes);
