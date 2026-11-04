import { z } from "zod";

import { AppError } from "../../common/errors/AppError.js";
import { prisma } from "../../db/prisma.js";

export const ITEM_OUTCOMES = ["PRESENTE", "MANCANTE", "SCADUTO", "NON_FUNZIONANTE"] as const;

export type ItemOutcome = (typeof ITEM_OUTCOMES)[number];

export const itemResultsSchema = z
  .array(
    z.object({
      itemId: z.number().int().positive(),
      outcome: z.enum(ITEM_OUTCOMES),
    }),
  )
  .min(1);

export type ItemResult = z.infer<typeof itemResultsSchema>[number];

export async function findVehicleByPlate(plate: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { plate: plate.trim().toUpperCase() } });
  if (!vehicle) {
    throw new AppError(404, "VEHICLE_NOT_FOUND", `Mezzo con targa ${plate} non trovato`);
  }
  return vehicle;
}

/**
 * Controlla che ci sia esattamente un esito per ogni voce della checklist
 * e restituisce gli esiti ordinati per itemId (forma stabile per l'hash).
 */
export async function assertCompleteResults(results: ItemResult[], field: string): Promise<ItemResult[]> {
  const items = await prisma.checklistItem.findMany({ select: { id: true } });
  const expected = new Set(items.map((item) => item.id));
  const seen = new Set<number>();

  for (const { itemId } of results) {
    if (!expected.has(itemId)) {
      throw new AppError(400, "VALIDATION_ERROR", `${field}: voce ${itemId} inesistente`);
    }
    if (seen.has(itemId)) {
      throw new AppError(400, "VALIDATION_ERROR", `${field}: voce ${itemId} duplicata`);
    }
    seen.add(itemId);
  }

  const missing = [...expected].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new AppError(400, "VALIDATION_ERROR", `${field}: mancano gli esiti di alcune voci`, { missing });
  }

  return [...results].sort((a, b) => a.itemId - b.itemId);
}

/**
 * La checklist si certifica solo se tutte le voci sono presenti: altrimenti
 * viene rifiutata (e non salvata) con l'elenco delle voci da sistemare.
 */
export async function assertAllPresent(results: ItemResult[]): Promise<void> {
  const notPresent = results.filter((result) => result.outcome !== "PRESENTE");
  if (notPresent.length === 0) {
    return;
  }

  const descriptions = new Map(
    (
      await prisma.checklistItem.findMany({
        where: { id: { in: notPresent.map((result) => result.itemId) } },
      })
    ).map((item) => [item.id, item.description]),
  );

  const count = notPresent.length === 1 ? "1 voce non risulta presente" : `${notPresent.length} voci non risultano presenti`;
  throw new AppError(422, "CHECKLIST_NOT_COMPLIANT", `Checklist non certificabile: ${count}`, {
    items: notPresent.map((result) => ({ ...result, description: descriptions.get(result.itemId) })),
  });
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** Ultima checklist certificata oggi per il mezzo, con l'eventuale ispezione. */
export function findTodaySubmission(vehicleId: number) {
  return prisma.checklistSubmission.findFirst({
    where: { vehicleId, confirmedAt: { gte: startOfToday() } },
    orderBy: { confirmedAt: "desc" },
    include: { inspection: true },
  });
}
