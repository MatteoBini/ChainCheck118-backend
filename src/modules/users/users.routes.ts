import { Router, type Request } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/AppError.js";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { authorize } from "../../common/middlewares/authorize.js";
import { isRecordNotFound, isUniqueViolation } from "../../common/utils/prismaErrors.js";
import { prisma } from "../../db/prisma.js";
import { hashPassword } from "../auth/password.js";

const username = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,32}$/, "Username di 3-32 caratteri: lettere, cifre, punto, trattino, underscore");
const fullName = z.string().trim().min(1, "Nome obbligatorio").max(100);
const password = z.string().min(8, "La password deve avere almeno 8 caratteri").max(128);
const role = z.enum(["OPERATORE", "SOCCORRITORE", "ISPETTORE"]);

const createSchema = z.object({ username, fullName, password, role });
const updateSchema = z
  .object({ username, fullName, password, role })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Nessun campo da aggiornare");
const idSchema = z.coerce.number().int().positive();

/** La password non esce mai dal backend, nemmeno come hash. */
const publicFields = { id: true, username: true, fullName: true, role: true } as const;

function duplicateUsername(): AppError {
  return new AppError(409, "USERNAME_TAKEN", "Username già in uso");
}

export const userRoutes = Router();

userRoutes.use(authenticate, authorize("OPERATORE"));

userRoutes.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.appUser.findMany({ orderBy: { id: "asc" }, select: publicFields });
    res.json({ items: users });
  } catch (error) {
    next(error);
  }
});

userRoutes.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Dati non validi", parsed.error.issues);
    }
    const { password: plain, ...data } = parsed.data;
    const user = await prisma.appUser
      .create({ data: { ...data, passwordHash: await hashPassword(plain) }, select: publicFields })
      .catch((error: unknown) => {
        throw isUniqueViolation(error) ? duplicateUsername() : error;
      });
    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

userRoutes.patch("/:id", async (req: Request<{ id: string }>, res, next) => {
  try {
    const id = idSchema.safeParse(req.params.id);
    const parsed = updateSchema.safeParse(req.body);
    if (!id.success || !parsed.success) {
      const message = parsed.success ? "Id non valido" : (parsed.error.issues[0]?.message ?? "Dati non validi");
      throw new AppError(400, "VALIDATION_ERROR", message, parsed.success ? undefined : parsed.error.issues);
    }
    const { password: plain, ...data } = parsed.data;

    // Un operatore non può togliersi da solo l'accesso a questa sezione.
    if (id.data === req.user!.id && data.role !== undefined && data.role !== req.user!.role) {
      throw new AppError(409, "SELF_ROLE_CHANGE", "Non puoi modificare il tuo stesso ruolo");
    }

    const user = await prisma.appUser
      .update({
        where: { id: id.data },
        data: { ...data, ...(plain === undefined ? {} : { passwordHash: await hashPassword(plain) }) },
        select: publicFields,
      })
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw duplicateUsername();
        if (isRecordNotFound(error)) throw new AppError(404, "USER_NOT_FOUND", "Utente non trovato");
        throw error;
      });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});
