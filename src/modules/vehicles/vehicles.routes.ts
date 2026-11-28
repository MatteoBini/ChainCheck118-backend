import { Router, type Request } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/AppError.js";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { isRecordNotFound, isUniqueViolation } from "../../common/utils/prismaErrors.js";
import { prisma } from "../../db/prisma.js";
import { findTodaySubmission, findVehicleByPlate } from "../checklists/checklists.service.js";

/** Targa normalizzata come in findVehicleByPlate: maiuscola e senza spazi. */
const plateSchema = z.object({
  plate: z
    .string()
    .transform((value) => value.replace(/\s+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,10}$/, "Targa di 2-10 caratteri alfanumerici")),
});
const idSchema = z.coerce.number().int().positive();

function parsePlate(body: unknown): string {
  const parsed = plateSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Targa non valida", parsed.error.issues);
  }
  return parsed.data.plate;
}

function duplicatePlate(plate: string): AppError {
  return new AppError(409, "PLATE_TAKEN", `Esiste già un mezzo con targa ${plate}`);
}

export const vehicleRoutes = Router();

vehicleRoutes.post("/", authenticate, authorize("OPERATORE"), async (req, res, next) => {
  try {
    const plate = parsePlate(req.body);
    const vehicle = await prisma.vehicle.create({ data: { plate } }).catch((error: unknown) => {
      throw isUniqueViolation(error) ? duplicatePlate(plate) : error;
    });
    res.status(201).json({ vehicle: { id: vehicle.id, plate: vehicle.plate } });
  } catch (error) {
    next(error);
  }
});

vehicleRoutes.patch("/:id", authenticate, authorize("OPERATORE"), async (req: Request<{ id: string }>, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    if (!id.success) throw new AppError(400, "VALIDATION_ERROR", "Id non valido");
    const plate = parsePlate(req.body);
    const vehicle = await prisma.vehicle.update({ where: { id: id.data }, data: { plate } }).catch((error: unknown) => {
      if (isUniqueViolation(error)) throw duplicatePlate(plate);
      if (isRecordNotFound(error)) throw new AppError(404, "VEHICLE_NOT_FOUND", "Mezzo non trovato");
      throw error;
    });
    res.json({ vehicle: { id: vehicle.id, plate: vehicle.plate } });
  } catch (error) {
    next(error);
  }
});

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
