import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", router);

// If the frontend has been built, serve it as static files so Replit (or any single-process host)
// can run both the API and the client from the same origin. Vite may output to `dist/public`.
try {
  const frontendBase = path.resolve(__dirname, "..", "..", "asateen-game");
  const candidatePublic = path.join(frontendBase, "dist", "public");
  const candidateDist = path.join(frontendBase, "dist");
  let frontendDist: string | null = null;
  if (existsSync(candidatePublic)) frontendDist = candidatePublic;
  else if (existsSync(candidateDist)) frontendDist = candidateDist;
  if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get(/(.*)/, (_req, res) => res.sendFile(path.join(frontendDist!, "index.html")));
  }
} catch (err) {
  logger.warn({ err }, "Could not enable static frontend serving");
}

export default app;