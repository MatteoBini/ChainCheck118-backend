import { Router } from "express";

import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { prisma } from "../../db/prisma.js";

export const reportRoutes = Router();

reportRoutes.get("/", authenticate, authorize("SOCCORRITORE"), async (req, res, next) => {
  try {
    const reports = await prisma.inspectionReport.findMany({
      where: { inspection: { submission: { userId: req.user!.id } } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        inspection: {
          include: {
            submission: { include: { vehicle: true } },
            inspector: { select: { id: true, username: true, fullName: true } },
          },
        },
      },
    });

    res.json({
      items: reports.map((report) => ({
        id: report.id,
        plate: report.inspection.submission.vehicle.plate,
        inspectedAt: report.inspection.inspectedAt,
        note: report.note,
        inspector: report.inspection.inspector,
      })),
    });
  } catch (error) {
    next(error);
  }
});
