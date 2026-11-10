import { Router, type Request } from "express";

import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { prisma } from "../../db/prisma.js";
import { findTodaySubmission, findVehicleByPlate } from "../checklists/checklists.service.js";

export const vehicleRoutes = Router();

vehicleRoutes.get("/", authenticate, authorize("OPERATORE"), async (_req, res, next) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      orderBy: { plate: "asc" },
      include: {
        submissions: {
          orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
          take: 1,
          include: {
            user: { select: { id: true, username: true, fullName: true } },
            inspection: true,
          },
        },
      },
    });

    res.json({
      items: vehicles.map((vehicle) => {
        const last = vehicle.submissions[0];
        return {
          id: vehicle.id,
          plate: vehicle.plate,
          lastChecklist: last
            ? {
                submissionId: last.id,
                certifiedAt: last.confirmedAt,
                by: last.user,
                inspection: last.inspection
                  ? { verdict: last.inspection.isCorrect ? "CONFORME" : "NON_CONFORME" }
                  : null,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    next(error);
  }
});

vehicleRoutes.get("/:plate", authenticate, async (req: Request<{ plate: string }>, res, next) => {
  try {
    const vehicle = await findVehicleByPlate(req.params.plate);
    const [items, today] = await Promise.all([
      prisma.checklistItem.findMany({ orderBy: { id: "asc" } }),
      findTodaySubmission(vehicle.id),
    ]);

    res.json({
      vehicle: { id: vehicle.id, plate: vehicle.plate },
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
