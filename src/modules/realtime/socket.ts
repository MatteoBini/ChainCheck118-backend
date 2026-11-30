// Server Socket.IO per la mappa in tempo reale (posizioni simulate).
// Contratto e regole: FEATURE-2-mappa-tempo-reale.md §2 (poi docs/architecture.md).
//
// - L'identità viene sempre dal token, mai dal messaggio.
// - Solo gli OPERATORE stanno nella room "operators", e i presence:* vanno solo lì.
// - Un solo socket per utente (regola della scheda unica, stile WhatsApp Web).
// - Stato solo in memoria, quindi funziona con una sola istanza del backend.

import type { Server as HttpServer } from "node:http";

import { Server, type Socket } from "socket.io";
import { z } from "zod";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../db/prisma.js";
import { verifyTokenWithExpiry } from "../auth/auth.service.js";
import { isInAllowedZone } from "./geo.js";
import { ZONES, type Zone } from "./zones.js";

export type TrackedRole = "SOCCORRITORE" | "ISPETTORE";

export type Presence = {
  userId: number;
  fullName: string;
  role: TrackedRole;
  lat: number;
  lng: number;
  updatedAt: string;
};

export type UpdateAck =
  | { ok: true }
  | { ok: false; code: "FORBIDDEN_ROLE" | "INVALID_PAYLOAD" | "OUT_OF_ZONE" | "RATE_LIMITED" };

type ServerToClient = {
  "session:replaced": (payload: Record<string, never>) => void;
  "session:expired": (payload: Record<string, never>) => void;
  "location:config": (payload: { zones: readonly Zone[]; intervalMs: number }) => void;
  "presence:snapshot": (payload: { users: Presence[] }) => void;
  "presence:update": (payload: Presence) => void;
  "presence:remove": (payload: { userId: number; reason: "DISCONNECTED" | "STALE" }) => void;
};

type ClientToServer = {
  "location:update": (payload: unknown, ack?: (result: UpdateAck) => void) => void;
};

type SocketData = {
  user: { id: number; fullName: string; role: z.infer<typeof roleSchema> };
  tabId: string;
  expiresAt: Date;
  lastUpdateAt: number;
};

type RealtimeSocket = Socket<ClientToServer, ServerToClient, Record<string, never>, SocketData>;

export type LoadUser = (id: number) => Promise<{ fullName: string } | null>;

export const OPERATORS_ROOM = "operators";
const INTERVAL_MS = 1000;
const MIN_UPDATE_GAP_MS = 500;
const SWEEP_MS = 1000;
// setTimeout accetta al massimo ~24,8 giorni.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const roleSchema = z.enum(["OPERATORE", "SOCCORRITORE", "ISPETTORE"]);
const handshakeSchema = z.object({
  token: z.string().min(1),
  tabId: z.string().min(1).max(64),
  takeover: z.boolean().optional(),
});
const updateSchema = z.object({ lat: z.number(), lng: z.number() });

const defaultLoadUser: LoadUser = (id) =>
  prisma.appUser.findUnique({ where: { id }, select: { fullName: true } });

export function attachRealtime(
  httpServer: HttpServer,
  {
    loadUser = defaultLoadUser,
    staleMs = env.PRESENCE_STALE_MS,
  }: { loadUser?: LoadUser; staleMs?: number } = {},
): Server<ClientToServer, ServerToClient, Record<string, never>, SocketData> {
  const log = logger.child({ module: "realtime" });
  const io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(httpServer, {
    path: "/socket.io",
    serveClient: false,
    maxHttpBufferSize: 10_000,
  });

  const sockets = new Map<number, RealtimeSocket>();
  const presences = new Map<number, { presence: Presence; seenAt: number }>();

  function removePresence(userId: number, reason: "DISCONNECTED" | "STALE"): void {
    if (presences.delete(userId)) {
      io.to(OPERATORS_ROOM).emit("presence:remove", { userId, reason });
    }
  }

  io.use(async (socket, next) => {
    const auth = handshakeSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      next(new Error("UNAUTHORIZED"));
      return;
    }
    const { token, tabId, takeover = false } = auth.data;

    let id: number;
    let role: z.infer<typeof roleSchema>;
    let expiresAt: Date;
    try {
      const verified = await verifyTokenWithExpiry(token);
      const parsedRole = roleSchema.safeParse(verified.user.role);
      if (!parsedRole.success) {
        throw new Error("Ruolo sconosciuto");
      }
      id = verified.user.id;
      role = parsedRole.data;
      expiresAt = verified.expiresAt;
    } catch (error) {
      log.debug({ reason: (error as Error).message }, "Handshake rifiutato");
      next(new Error("UNAUTHORIZED"));
      return;
    }

    let dbUser: { fullName: string } | null;
    try {
      dbUser = await loadUser(id);
    } catch (error) {
      log.error({ err: error, userId: id }, "Lettura utente fallita durante l'handshake");
      next(new Error("UNAVAILABLE"));
      return;
    }
    if (!dbUser) {
      log.debug({ userId: id }, "Handshake rifiutato: utente inesistente");
      next(new Error("UNAUTHORIZED"));
      return;
    }

    const existing = sockets.get(id);
    if (existing && existing.data.tabId !== tabId && !takeover) {
      next(new Error("ALREADY_OPEN"));
      return;
    }

    socket.data = {
      user: { id, fullName: dbUser.fullName, role },
      tabId,
      expiresAt,
      lastUpdateAt: 0,
    };
    next();
  });

  io.on("connection", (socket) => {
    const { user, tabId } = socket.data;

    // Sostituzione del socket precedente. Si registra il nuovo prima di chiudere il
    // vecchio, così il disconnect del vecchio non lo tratta come socket corrente.
    const previous = sockets.get(user.id);
    sockets.set(user.id, socket);
    if (previous && previous !== socket) {
      if (previous.data.tabId !== tabId) {
        previous.emit("session:replaced", {});
      }
      previous.disconnect(true);
      removePresence(user.id, "DISCONNECTED");
    }

    const expiryTimer = setTimeout(
      () => {
        socket.emit("session:expired", {});
        socket.disconnect(true);
      },
      Math.min(Math.max(socket.data.expiresAt.getTime() - Date.now(), 0), MAX_TIMEOUT_MS),
    );

    log.info({ userId: user.id, role: user.role }, "Socket collegato");

    if (user.role === "OPERATORE") {
      void socket.join(OPERATORS_ROOM);
      socket.emit("presence:snapshot", {
        users: [...presences.values()].map((entry) => entry.presence),
      });
    } else {
      socket.emit("location:config", { zones: ZONES, intervalMs: INTERVAL_MS });
    }

    socket.on("location:update", (payload, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};

      if (user.role === "OPERATORE") {
        reply({ ok: false, code: "FORBIDDEN_ROLE" });
        return;
      }
      const parsed = updateSchema.safeParse(payload);
      if (!parsed.success) {
        reply({ ok: false, code: "INVALID_PAYLOAD" });
        return;
      }
      const { lat, lng } = parsed.data;
      if (!isInAllowedZone(lat, lng)) {
        log.warn({ userId: user.id, lat, lng }, "Posizione fuori dalle zone consentite");
        reply({ ok: false, code: "OUT_OF_ZONE" });
        return;
      }
      const now = Date.now();
      if (now - socket.data.lastUpdateAt < MIN_UPDATE_GAP_MS) {
        reply({ ok: false, code: "RATE_LIMITED" });
        return;
      }
      socket.data.lastUpdateAt = now;

      const presence: Presence = {
        userId: user.id,
        fullName: user.fullName,
        role: user.role,
        lat,
        lng,
        updatedAt: new Date(now).toISOString(),
      };
      presences.set(user.id, { presence, seenAt: now });
      io.to(OPERATORS_ROOM).emit("presence:update", presence);
      reply({ ok: true });
    });

    socket.on("disconnect", (reason) => {
      clearTimeout(expiryTimer);
      log.info({ userId: user.id, reason }, "Socket scollegato");
      if (sockets.get(user.id) === socket) {
        sockets.delete(user.id);
        removePresence(user.id, "DISCONNECTED");
      }
    });
  });

  const sweep = setInterval(() => {
    const limit = Date.now() - staleMs;
    for (const [userId, entry] of presences) {
      if (entry.seenAt < limit) {
        removePresence(userId, "STALE");
      }
    }
  }, SWEEP_MS);
  sweep.unref();
  httpServer.once("close", () => clearInterval(sweep));

  return io;
}
