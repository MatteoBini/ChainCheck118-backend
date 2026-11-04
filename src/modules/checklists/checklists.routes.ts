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

const submitSchema = z.object({
  plate: z.string().trim().min(1),
  items: itemResultsSchema,
});

export const checklistRoutes = Router();

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
