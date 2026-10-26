import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@prisma/client";

import { env } from "../../config/env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface TokenUser {
  id: number;
  username: string;
  role: Role;
}

export async function signToken(user: TokenUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
}

export async function verifyToken(token: string): Promise<TokenUser> {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

  const id = Number(payload.sub);
  const username = payload.username;
  const role = payload.role;

  if (!Number.isInteger(id) || typeof username !== "string" || typeof role !== "string") {
    throw new Error("Payload del token non valido");
  }

  return { id, username, role: role as Role };
}
