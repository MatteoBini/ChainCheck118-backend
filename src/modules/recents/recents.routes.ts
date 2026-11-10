import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/AppError.js";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { prisma } from "../../db/prisma.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

type RecentEntry =
  | {
      id: string;
      kind: "CHECKLIST";
      plate: string;
      at: Date;
      inspection: null | { verdict: "CONFORME" | "NON_CONFORME" };
    }
  | {
      id: string;
      kind: "INSPECTION";
      plate: string;
      at: Date;
      verdict: "CONFORME" | "NON_CONFORME";
    };

const verdictOf = (isCorrect: boolean): "CONFORME" | "NON_CONFORME" =>
  isCorrect ? "CONFORME" : "NON_CONFORME";

export const recentRoutes = Router();

recentRoutes.get("/", authenticate, async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Parametri non validi", parsed.error.issues);
    }
    const { limit } = parsed.data;
    const user = req.user!;

    let entries: RecentEntry[];

    if (user.role === "ISPETTORE") {
      const inspections = await prisma.inspection.findMany({
        where: { inspectorId: user.id },
        orderBy: { inspectedAt: "desc" },
        take: limit,
        include: { submission: { include: { vehicle: true } } },
      });
      entries = inspections.map((inspection) => ({
        id: `inspection-${inspection.id}`,
        kind: "INSPECTION",
        plate: inspection.submission.vehicle.plate,
        at: inspection.inspectedAt,
        verdict: verdictOf(inspection.isCorrect),
      }));
    } else {
      const submissions = await prisma.checklistSubmission.findMany({
        where: user.role === "SOCCORRITORE" ? { userId: user.id } : {},
        orderBy: { confirmedAt: "desc" },
        take: limit,
        include: { vehicle: true, inspection: true },
      });
      entries = submissions.map((submission) => ({
        id: `checklist-${submission.id}`,
        kind: "CHECKLIST",
        plate: submission.vehicle.plate,
        at: submission.confirmedAt,
        inspection: submission.inspection ? { verdict: verdictOf(submission.inspection.isCorrect) } : null,
      }));
    }

    res.json({ items: entries });
  } catch (error) {
    next(error);
  }
});
