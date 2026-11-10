import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/AppError.js";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { hashRecord } from "../../common/utils/hash.js";
import { prisma } from "../../db/prisma.js";
import { writeRecord } from "../blockchain/blockchain.service.js";
import {
  assertAllPresent,
  assertCompleteResults,
  findVehicleByPlate,
  itemResultsSchema,
} from "./checklists.service.js";

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  /** id dell'ultima voce della pagina precedente. */
  cursor: z.coerce.number().int().positive().optional(),
  plate: z.string().trim().min(1).optional(),
});

const submitSchema = z.object({
  plate: z.string().trim().min(1),
  items: itemResultsSchema,
});

export const checklistRoutes = Router();

checklistRoutes.get("/", authenticate, authorize("OPERATORE"), async (req, res, next) => {
  try {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Parametri non validi", parsed.error.issues);
    }
    const { limit, cursor, plate } = parsed.data;

    const submissions = await prisma.checklistSubmission.findMany({
      where: plate ? { vehicle: { plate: plate.toUpperCase() } } : {},
      orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        vehicle: true,
        user: { select: { id: true, username: true, fullName: true } },
        inspection: { include: { inspector: { select: { id: true, username: true, fullName: true } } } },
      },
    });

    const page = submissions.slice(0, limit);
    res.json({
      items: page.map((submission) => ({
        id: submission.id,
        plate: submission.vehicle.plate,
        certifiedAt: submission.confirmedAt,
        by: submission.user,
        inspection: submission.inspection
          ? {
              verdict: submission.inspection.isCorrect ? "CONFORME" : "NON_CONFORME",
              inspectedAt: submission.inspection.inspectedAt,
              by: submission.inspection.inspector,
            }
          : null,
      })),
      nextCursor: submissions.length > limit ? page[page.length - 1]!.id : null,
    });
  } catch (error) {
    next(error);
  }
});

checklistRoutes.post("/", authenticate, authorize("SOCCORRITORE"), async (req, res, next) => {
  try {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Checklist non valida", parsed.error.issues);
    }

    const vehicle = await findVehicleByPlate(parsed.data.plate);
    const items = await assertCompleteResults(parsed.data.items, "items");
    await assertAllPresent(items);
    const certifiedAt = new Date();

    const hash = hashRecord({
      type: "TURN_CHECK",
      plate: vehicle.plate,
      userId: req.user!.id,
      certifiedAt,
      items,
    });
    const chain = await writeRecord("TURN_CHECK", hash);

    const submission = await prisma.checklistSubmission.create({
      data: { vehicleId: vehicle.id, userId: req.user!.id, confirmedAt: certifiedAt },
    });

    res.status(201).json({
      submissionId: submission.id,
      plate: vehicle.plate,
      recordId: chain.recordId,
      hash,
      txHash: chain.txHash,
      certifiedAt: submission.confirmedAt,
    });
  } catch (error) {
    next(error);
  }
});
