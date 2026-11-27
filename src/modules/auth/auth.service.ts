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

export interface VerifiedToken {
  user: TokenUser;
  expiresAt: Date;
}

async function verify(token: string) {
  const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });

  const id = Number(payload.sub);
  const username = payload.username;
  const role = payload.role;

  if (!Number.isInteger(id) || typeof username !== "string" || typeof role !== "string") {
    throw new Error("Payload del token non valido");
  }

  const user: TokenUser = { id, username, role: role as Role };
  return { user, exp: payload.exp };
}

export async function verifyToken(token: string): Promise<TokenUser> {
  return (await verify(token)).user;
}

// Come verifyToken, ma restituisce anche la scadenza (serve al realtime per chiudere
// il socket quando il token scade). Un token senza `exp` viene rifiutato.
export async function verifyTokenWithExpiry(token: string): Promise<VerifiedToken> {
  const { user, exp } = await verify(token);
  if (typeof exp !== "number") {
    throw new Error("Token senza scadenza");
  }
  return { user, expiresAt: new Date(exp * 1000) };
}
