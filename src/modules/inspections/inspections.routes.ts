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
  startOfToday,
} from "../checklists/checklists.service.js";
import { compareResults } from "./inspections.service.js";

const inspectionSchema = z.object({
  plate: z.string().trim().min(1),
  // Gli esiti per voce non sono salvati sul DB: il client invia quelli della checklist certificata.
  declared: itemResultsSchema,
  observed: itemResultsSchema,
  note: z.string().trim().max(500).optional(),
});

export const inspectionRoutes = Router();

inspectionRoutes.get("/pending", authenticate, authorize("ISPETTORE"), async (_req, res, next) => {
  try {
    const submissions = await prisma.checklistSubmission.findMany({
      where: { confirmedAt: { gte: startOfToday() } },
      orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
      include: { vehicle: true, user: { select: { id: true, username: true, fullName: true } }, inspection: true },
    });

    // Un mezzo può essere ricertificato più volte nello stesso giorno: conta solo l'ultima
    // submission (quella su cui POST /inspections agisce davvero, vedi findTodaySubmission).
    const latestByVehicle = new Map<number, (typeof submissions)[number]>();
    for (const submission of submissions) {
      if (!latestByVehicle.has(submission.vehicleId)) {
        latestByVehicle.set(submission.vehicleId, submission);
      }
    }

    const pending = [...latestByVehicle.values()].filter((submission) => submission.inspection === null);

    res.json({
      items: pending.map((submission) => ({
        submissionId: submission.id,
        plate: submission.vehicle.plate,
        certifiedAt: submission.confirmedAt,
        by: submission.user,
      })),
    });
  } catch (error) {
    next(error);
  }
});

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

    const note = parsed.data.note ?? null;

    const hash = hashRecord({
      type: "INSPECTION",
      plate: vehicle.plate,
      submissionId: submission.id,
      inspectorId: req.user!.id,
      inspectedAt,
      observed,
      isCorrect,
      note,
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

    if (!isCorrect) {
      await prisma.inspectionReport.create({ data: { inspectionId: inspection.id, note } });
    }

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
      note,
      recordId: chain.recordId,
      hash,
      txHash: chain.txHash,
      inspectedAt: inspection.inspectedAt,
    });
  } catch (error) {
    next(error);
  }
});
