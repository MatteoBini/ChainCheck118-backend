import { Router, type Request } from "express";

import { authenticate } from "../../common/middlewares/authenticate.js";
import { prisma } from "../../db/prisma.js";
import { findTodaySubmission, findVehicleByCode } from "../checklists/checklists.service.js";

export const vehicleRoutes = Router();

vehicleRoutes.get("/:code", authenticate, async (req: Request<{ code: string }>, res, next) => {
  try {
    const vehicle = await findVehicleByCode(req.params.code);
    const [items, today] = await Promise.all([
      prisma.checklistItem.findMany({ orderBy: { id: "asc" } }),
      findTodaySubmission(vehicle.id),
    ]);

    res.json({
      vehicle: { id: vehicle.id, code: vehicle.plate },
      items: items.map((item) => ({ id: item.id, description: item.description })),
      today: today
        ? {
            status: "CERTIFIED",
            submissionId: today.id,
            certifiedAt: today.confirmedAt,
            inspected: today.inspection !== null,
          }
        : { status: "NONE" },
    });
  } catch (error) {
    next(error);
  }
});
