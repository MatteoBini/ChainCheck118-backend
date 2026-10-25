import express from "express";
import { pinoHttp } from "pino-http";

import { errorHandler, notFoundHandler } from "./common/middlewares/errorHandler.js";
import { logger } from "./config/logger.js";
import { routes } from "./routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(pinoHttp({ logger }));
  app.use(express.json());

  app.use(routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
