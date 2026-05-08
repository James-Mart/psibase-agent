import express, { type Express } from "express";
import { join } from "path";
import { distDir, hasBuiltClient, isProdEnv } from "./config.js";
import { errorHandler } from "./errors.js";
import { workersRouter } from "./routes/workers.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json());

  const serveStatic = isProdEnv && hasBuiltClient;
  if (serveStatic) {
    app.use(express.static(distDir));
  }

  app.use("/api/workers", workersRouter);

  if (serveStatic) {
    app.get("*", (_req, res) => {
      res.sendFile(join(distDir, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
