import type { Server } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./db/prisma.js";

const app = createApp();

const server: Server = app.listen(env.PORT, () => {
  logger.info(`Server in ascolto sulla porta ${env.PORT} [${env.NODE_ENV}]`);
});

async function shutdown(signal: string): Promise<void> {
  logger.info(`Ricevuto ${signal}, arresto in corso`);

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, "Errore durante la chiusura del server");
    }
    await prisma.$disconnect();
    process.exit(error ? 1 : 0);
  });

  setTimeout(() => {
    logger.error("Arresto forzato dopo timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
