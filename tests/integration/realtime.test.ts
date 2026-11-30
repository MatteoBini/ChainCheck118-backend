// Test di integrazione del server Socket.IO (src/modules/realtime/socket.ts).
// Girano senza DB e senza chain: `loadUser` è sostituito e le variabili sono fittizie.
//
//   npm run test:integration

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, test } from "node:test";

import { SignJWT } from "jose";
import { io as connect, type Socket } from "socket.io-client";

// env.ts valida process.env già all'import: le variabili vanno impostate prima.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.JWT_SECRET = "segreto-dei-test-lungo-almeno-32-caratteri";
process.env.CHAIN_RPC_URL = "http://localhost:8545";
process.env.CHAIN_PRIVATE_KEY = "0x00";
process.env.CHAIN_CONTRACT_ADDRESS = "0x00";

const { attachRealtime } = await import("../../src/modules/realtime/socket.js");
const { signToken } = await import("../../src/modules/auth/auth.service.js");

type Role = "OPERATORE" | "SOCCORRITORE" | "ISPETTORE";

const USERS: Record<number, { username: string; fullName: string; role: Role }> = {
  1: { username: "operatore", fullName: "Marco Rossi", role: "OPERATORE" },
  2: { username: "crew-a", fullName: "Crew A", role: "SOCCORRITORE" },
  3: { username: "crew-b", fullName: "Crew B", role: "SOCCORRITORE" },
  4: { username: "ispettore", fullName: "Luca Verdi", role: "ISPETTORE" },
};
const OPERATOR = 1;
const CREW_A = 2;
const CREW_B = 3;
const INSPECTOR = 4;

const PARMA = { lat: 44.8015, lng: 10.3279 };
const BOLOGNA = { lat: 44.4949, lng: 11.3426 };
const ROMA = { lat: 41.9, lng: 12.5 };

const secret = new TextEncoder().encode(process.env.JWT_SECRET);

function tokenFor(id: number): Promise<string> {
  const user = USERS[id]!;
  return signToken({ id, username: user.username, role: user.role });
}

function rawToken(claims: Record<string, unknown>, exp: number | string, key = secret): Promise<string> {
  return new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject(String(claims.sub ?? 2)).setExpirationTime(exp).sign(key);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Server e client ──────────────────────────────────────────────────────────

const servers: Array<{ close: () => Promise<void> }> = [];
const clients: Socket[] = [];

type Options = Parameters<typeof attachRealtime>[1];

async function startServer(options: Options = {}): Promise<string> {
  const http = createServer();
  const io = attachRealtime(http, {
    loadUser: async (id) => (USERS[id] ? { fullName: USERS[id].fullName } : null),
    ...options,
  });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  servers.push({ close: () => io.close() });
  return `http://localhost:${(http.address() as AddressInfo).port}`;
}

type Received = Array<{ event: string; payload: unknown }>;
type Client = { socket: Socket; received: Received };

// Crea il client registrando subito tutti gli eventi in arrivo, così non si perdono
// quelli inviati dal server appena dopo il connect.
function open(url: string, auth: Record<string, unknown>): Client {
  const socket = connect(url, { auth, reconnection: false, transports: ["websocket"], forceNew: true });
  const received: Received = [];
  socket.onAny((event, payload) => received.push({ event, payload }));
  clients.push(socket);
  return { socket, received };
}

function connected(client: Client): Promise<Client> {
  return new Promise((resolve, reject) => {
    client.socket.once("connect", () => resolve(client));
    client.socket.once("connect_error", (error) => reject(error));
  });
}

function connectError(client: Client): Promise<string> {
  return new Promise((resolve, reject) => {
    client.socket.once("connect", () => reject(new Error("connessione accettata")));
    client.socket.once("connect_error", (error) => resolve(error.message));
  });
}

async function join(url: string, id: number, tabId = `tab-${id}`, takeover = false): Promise<Client> {
  return connected(open(url, { token: await tokenFor(id), tabId, takeover }));
}

// Attende il primo evento `event` ricevuto (anche prima della chiamata) che soddisfa `match`.
async function waitFor<T = unknown>(
  client: Client,
  event: string,
  match: (payload: T) => boolean = () => true,
  timeoutMs = 2500,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = client.received.find((r) => r.event === event && match(r.payload as T));
    if (hit) {
      return hit.payload as T;
    }
    await delay(10);
  }
  throw new Error(`evento ${event} non ricevuto entro ${timeoutMs} ms`);
}

function waitDisconnect(client: Client, timeoutMs = 2500): Promise<string> {
  if (!client.socket.connected) {
    return Promise.resolve("già scollegato");
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket ancora collegato")), timeoutMs);
    client.socket.once("disconnect", (reason) => {
      clearTimeout(timer);
      resolve(reason);
    });
  });
}

function send(client: Client, position: unknown): Promise<{ ok: boolean; code?: string }> {
  return client.socket.timeout(2000).emitWithAck("location:update", position);
}

type PresencePayload = { userId: number; fullName: string; role: Role; lat: number; lng: number; updatedAt: string };

afterEach(async () => {
  for (const socket of clients.splice(0)) {
    socket.close();
  }
  for (const server of servers.splice(0)) {
    await server.close();
  }
});

// ── Test ─────────────────────────────────────────────────────────────────────

describe("autenticazione dell'handshake", () => {
  test("senza token → UNAUTHORIZED", async () => {
    const url = await startServer();
    assert.equal(await connectError(open(url, { tabId: "t" })), "UNAUTHORIZED");
  });

  test("senza tabId → UNAUTHORIZED", async () => {
    const url = await startServer();
    assert.equal(await connectError(open(url, { token: await tokenFor(CREW_A) })), "UNAUTHORIZED");
  });

  test("token con firma errata → UNAUTHORIZED", async () => {
    const url = await startServer();
    const other = new TextEncoder().encode("un-altro-segreto-lungo-almeno-32-caratteri");
    const token = await rawToken({ username: "crew-a", role: "SOCCORRITORE" }, "1h", other);
    assert.equal(await connectError(open(url, { token, tabId: "t" })), "UNAUTHORIZED");
  });

  test("token scaduto → UNAUTHORIZED", async () => {
    const url = await startServer();
    const token = await rawToken({ username: "crew-a", role: "SOCCORRITORE" }, Math.floor(Date.now() / 1000) - 10);
    assert.equal(await connectError(open(url, { token, tabId: "t" })), "UNAUTHORIZED");
  });

  test("ruolo sconosciuto (ADMIN) → UNAUTHORIZED", async () => {
    const url = await startServer();
    const token = await rawToken({ username: "operatore", role: "ADMIN", sub: OPERATOR }, "1h");
    assert.equal(await connectError(open(url, { token, tabId: "t" })), "UNAUTHORIZED");
  });

  test("utente non più presente nel DB → UNAUTHORIZED", async () => {
    const url = await startServer();
    const token = await signToken({ id: 404, username: "cancellato", role: "SOCCORRITORE" });
    assert.equal(await connectError(open(url, { token, tabId: "t" })), "UNAUTHORIZED");
  });

  test("DB non raggiungibile → UNAVAILABLE (non UNAUTHORIZED)", async () => {
    const url = await startServer({
      loadUser: async () => {
        throw new Error("DB giù");
      },
    });
    assert.equal(await connectError(open(url, { token: await tokenFor(CREW_A), tabId: "t" })), "UNAVAILABLE");
  });
});

describe("isolamento e contenuto delle posizioni", () => {
  test("solo l'operatore riceve presence:*; il crew riceve solo location:config", async () => {
    const url = await startServer();
    const crewA = await join(url, CREW_A);
    const crewB = await join(url, CREW_B);
    const inspector = await join(url, INSPECTOR);
    const operator = await join(url, OPERATOR);
    await waitFor(operator, "presence:snapshot");

    const config = await waitFor<{ zones: unknown[]; intervalMs: number }>(crewB, "location:config");
    assert.equal(config.zones.length, 6);
    assert.equal(config.intervalMs, 1000);

    assert.deepEqual(await send(crewB, PARMA), { ok: true });
    assert.deepEqual(await send(inspector, BOLOGNA), { ok: true });

    const fromB = await waitFor<PresencePayload>(operator, "presence:update", (p) => p.userId === CREW_B);
    const fromInspector = await waitFor<PresencePayload>(operator, "presence:update", (p) => p.userId === INSPECTOR);
    assert.equal(fromB.role, "SOCCORRITORE");
    assert.equal(fromInspector.role, "ISPETTORE");
    assert.equal(fromInspector.fullName, "Luca Verdi");

    await delay(1500);
    assert.deepEqual(
      crewA.received.map((r) => r.event),
      ["location:config"],
    );
    assert.ok(!inspector.received.some((r) => r.event.startsWith("presence:")));
    assert.ok(!operator.received.some((r) => r.event === "location:config"));
  });

  test("userId, ruolo e nome nel payload del client vengono ignorati", async () => {
    const url = await startServer();
    const operator = await join(url, OPERATOR);
    const crew = await join(url, CREW_A);

    const ack = await send(crew, { ...PARMA, userId: 99, role: "OPERATORE", fullName: "Falso" });
    assert.deepEqual(ack, { ok: true });

    const presence = await waitFor<PresencePayload>(operator, "presence:update");
    assert.deepEqual(
      { userId: presence.userId, role: presence.role, fullName: presence.fullName, lat: presence.lat, lng: presence.lng },
      { userId: CREW_A, role: "SOCCORRITORE", fullName: "Crew A", ...PARMA },
    );
    assert.ok(!Number.isNaN(Date.parse(presence.updatedAt)));
  });

  test("snapshot: chi si collega dopo vede chi sta già trasmettendo", async () => {
    const url = await startServer();
    const crew = await join(url, CREW_A);
    await send(crew, PARMA);

    const operator = await join(url, OPERATOR);
    const snapshot = await waitFor<{ users: PresencePayload[] }>(operator, "presence:snapshot");
    assert.deepEqual(
      snapshot.users.map((u) => u.userId),
      [CREW_A],
    );
  });
});

describe("validazione di location:update", () => {
  test("da OPERATORE → FORBIDDEN_ROLE e nessun broadcast", async () => {
    const url = await startServer();
    const operator = await join(url, OPERATOR);
    assert.deepEqual(await send(operator, PARMA), { ok: false, code: "FORBIDDEN_ROLE" });
    await delay(200);
    assert.ok(!operator.received.some((r) => r.event === "presence:update"));
  });

  test("payload non valido → INVALID_PAYLOAD", async () => {
    const url = await startServer();
    const crew = await join(url, CREW_A);
    for (const payload of [{ lat: "44", lng: 10.3 }, { lat: Number.NaN, lng: 10.3 }, { lat: 44.8 }, null, "44.8,10.3"]) {
      assert.deepEqual(await send(crew, payload), { ok: false, code: "INVALID_PAYLOAD" }, JSON.stringify(payload));
    }
  });

  test("fuori zona (Roma) → OUT_OF_ZONE", async () => {
    const url = await startServer();
    const crew = await join(url, CREW_A);
    assert.deepEqual(await send(crew, ROMA), { ok: false, code: "OUT_OF_ZONE" });
  });

  test("due update a 100 ms → il secondo RATE_LIMITED, dopo 500 ms di nuovo ok", async () => {
    const url = await startServer();
    const crew = await join(url, CREW_A);
    assert.deepEqual(await send(crew, PARMA), { ok: true });
    await delay(100);
    assert.deepEqual(await send(crew, PARMA), { ok: false, code: "RATE_LIMITED" });
    await delay(500);
    assert.deepEqual(await send(crew, PARMA), { ok: true });
  });
});

describe("rimozione delle posizioni", () => {
  test("disconnessione → presence:remove DISCONNECTED", async () => {
    const url = await startServer();
    const operator = await join(url, OPERATOR);
    const crew = await join(url, CREW_A);
    await send(crew, PARMA);
    await waitFor(operator, "presence:update");

    crew.socket.close();
    assert.deepEqual(await waitFor(operator, "presence:remove"), { userId: CREW_A, reason: "DISCONNECTED" });
  });

  test("nessun update per più di staleMs → presence:remove STALE", async () => {
    const url = await startServer({ staleMs: 300 });
    const operator = await join(url, OPERATOR);
    const crew = await join(url, CREW_A);
    await send(crew, PARMA);

    assert.deepEqual(await waitFor(operator, "presence:remove"), { userId: CREW_A, reason: "STALE" });
    assert.ok(crew.socket.connected, "il socket resta aperto, sparisce solo la posizione");
    const operator2 = await join(url, OPERATOR, "tab-1", false);
    assert.deepEqual(await waitFor(operator2, "presence:snapshot"), { users: [] });
  });
});

describe("una sola scheda per utente", () => {
  test("altra scheda → ALREADY_OPEN", async () => {
    const url = await startServer();
    const first = await join(url, CREW_A, "scheda-1");
    const error = await connectError(open(url, { token: await tokenFor(CREW_A), tabId: "scheda-2" }));
    assert.equal(error, "ALREADY_OPEN");
    assert.ok(first.socket.connected);
  });

  test("Usa qui (takeover) → la vecchia riceve session:replaced e si chiude, la nuova trasmette", async () => {
    const url = await startServer();
    const operator = await join(url, OPERATOR);
    const first = await join(url, CREW_A, "scheda-1");
    await send(first, PARMA);
    await waitFor(operator, "presence:update");

    const firstClosed = waitDisconnect(first);
    const second = await join(url, CREW_A, "scheda-2", true);
    await waitFor(first, "session:replaced");
    assert.equal(await firstClosed, "io server disconnect");
    assert.deepEqual(await waitFor(operator, "presence:remove"), { userId: CREW_A, reason: "DISCONNECTED" });

    assert.deepEqual(await send(second, BOLOGNA), { ok: true });
    await waitFor<PresencePayload>(operator, "presence:update", (p) => p.lat === BOLOGNA.lat);
  });

  test("stesso tabId (F5) → sostituzione senza errore e senza session:replaced", async () => {
    const url = await startServer();
    const first = await join(url, CREW_A, "scheda-1");
    const firstClosed = waitDisconnect(first);
    const reloaded = await join(url, CREW_A, "scheda-1");

    assert.equal(await firstClosed, "io server disconnect");
    assert.ok(!first.received.some((r) => r.event === "session:replaced"));
    assert.ok(reloaded.socket.connected);
    assert.deepEqual(await send(reloaded, PARMA), { ok: true });
  });

  test("vale anche per l'OPERATORE", async () => {
    const url = await startServer();
    const first = await join(url, OPERATOR, "scheda-1");
    assert.equal(await connectError(open(url, { token: await tokenFor(OPERATOR), tabId: "scheda-2" })), "ALREADY_OPEN");

    const firstClosed = waitDisconnect(first);
    const second = await join(url, OPERATOR, "scheda-2", true);
    await waitFor(first, "session:replaced");
    await firstClosed;
    await waitFor(second, "presence:snapshot");
  });
});

describe("scadenza del token", () => {
  test("token che scade fra 1-2 s → session:expired e disconnessione", async () => {
    const url = await startServer();
    const token = await rawToken(
      { username: "crew-a", role: "SOCCORRITORE", sub: CREW_A },
      Math.floor(Date.now() / 1000) + 2,
    );
    const crew = await connected(open(url, { token, tabId: "t" }));
    const closed = waitDisconnect(crew, 3500);
    await waitFor(crew, "session:expired", () => true, 3000);
    assert.equal(await closed, "io server disconnect");
  });
});
