import { randomBytes } from "node:crypto";

import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../common/errors/AppError.js";
import { authenticate } from "../../common/middlewares/authenticate.js";
import { prisma } from "../../db/prisma.js";
import { signToken } from "./auth.service.js";
import { hashPassword, verifyPassword } from "./password.js";

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

const dummyHash = await hashPassword(randomBytes(32).toString("hex"));

export const authRoutes = Router();

authRoutes.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Credenziali non valide", parsed.error.issues);
    }

    const { username, password } = parsed.data;
    const user = await prisma.appUser.findUnique({ where: { username } });

    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, dummyHash);

    if (!user || !valid) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Username o password non corretti");
    }

    const token = await signToken({ id: user.id, username: user.username, role: user.role });

    res.json({
      token,
      user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
    });
  } catch (error) {
    next(error);
  }
});

authRoutes.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.appUser.findUnique({
      where: { id: req.user!.id },
      select: { id: true, username: true, fullName: true, role: true },
    });

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Utente non più esistente");
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});
