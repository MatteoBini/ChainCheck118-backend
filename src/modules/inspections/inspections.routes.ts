import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/AppError.js";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { hashRecord } from "../../common/utils/hash.js";
import { prisma } from "../../db/prisma.js";
import { writeRecord } from "../blockchain/blockchain.service.js";
import {
  assertCompleteResults,
  findTodaySubmission,
  findVehicleByPlate,
  itemResultsSchema,
} from "../checklists/checklists.service.js";
import { compareResults } from "./inspections.service.js";

const inspectionSchema = z.object({
  plate: z.string().trim().min(1),
  // Gli esiti per voce non sono salvati sul DB: il client invia quelli della checklist certificata.
  declared: itemResultsSchema,
  observed: itemResultsSchema,
});

export const inspectionRoutes = Router();

inspectionRoutes.post("/", authenticate, authorize("ISPETTORE"), async (req, res, next) => {
  try {
    const parsed = inspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Ispezione non valida", parsed.error.issues);
    }

    const vehicle = await findVehicleByPlate(parsed.data.plate);
    const submission = await findTodaySubmission(vehicle.id);
    if (!submission) {
      throw new AppError(409, "CHECKLIST_NOT_CERTIFIED", "Nessuna checklist certificata oggi per questo mezzo");
    }
    if (submission.inspection) {
      throw new AppError(409, "ALREADY_INSPECTED", "La checklist di oggi è già stata ispezionata");
    }

    const declared = await assertCompleteResults(parsed.data.declared, "declared");
    const observed = await assertCompleteResults(parsed.data.observed, "observed");
    const discrepancies = compareResults(declared, observed);
    const isCorrect = discrepancies.length === 0;
    const inspectedAt = new Date();

    const hash = hashRecord({
      type: "INSPECTION",
      plate: vehicle.plate,
      submissionId: submission.id,
      inspectorId: req.user!.id,
      inspectedAt,
      observed,
      isCorrect,
    });
    const chain = await writeRecord("INSPECTION", hash);

    const inspection = await prisma.inspection
      .create({
        data: { submissionId: submission.id, inspectorId: req.user!.id, isCorrect, inspectedAt },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new AppError(409, "ALREADY_INSPECTED", "La checklist di oggi è già stata ispezionata");
        }
        throw error;
      });

    const descriptions = new Map(
      (
        await prisma.checklistItem.findMany({
          where: { id: { in: discrepancies.map((d) => d.itemId) } },
        })
      ).map((item) => [item.id, item.description]),
    );

    res.status(201).json({
      inspectionId: inspection.id,
      submissionId: submission.id,
      plate: vehicle.plate,
      verdict: isCorrect ? "CONFORME" : "NON_CONFORME",
      discrepancies: discrepancies.map((d) => ({ ...d, description: descriptions.get(d.itemId) })),
      recordId: chain.recordId,
      hash,
      txHash: chain.txHash,
      inspectedAt: inspection.inspectedAt,
    });
  } catch (error) {
    next(error);
  }
});
