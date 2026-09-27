import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { optionalAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter, stripeWebhookHandler } from "./routes/billing.js";
import { catalogRouter } from "./routes/catalog.js";
import { meRouter } from "./routes/me.js";
import { playbackRouter } from "./routes/playback.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());

  // Must see the raw body, so it is registered before express.json().
  app.post("/billing/webhook", ...stripeWebhookHandler);

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(optionalAuth);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/auth", authRouter);
  app.use("/catalog", catalogRouter);
  app.use("/me", meRouter);
  app.use("/playback", playbackRouter);
  app.use("/billing", billingRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
