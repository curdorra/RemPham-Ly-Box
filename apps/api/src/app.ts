import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./lib/errors.js";
import { LOCAL_UPLOAD_DIR } from "./lib/media.js";
import { optionalAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { boxOfficeRouter } from "./routes/boxoffice.js";
import { catalogRouter } from "./routes/catalog.js";
import { cinemaRouter } from "./routes/cinema.js";
import { meRouter } from "./routes/me.js";
import { ordersRouter, razorpayWebhookHandler } from "./routes/orders.js";
import { playbackRouter } from "./routes/playback.js";
import { profilesRouter } from "./routes/profiles.js";
import { screeningsRouter } from "./routes/screenings.js";
import { searchRouter } from "./routes/search.js";
import { snacksRouter } from "./routes/snacks.js";
import { ticketsRouter } from "./routes/tickets.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());

  // Must see the raw body, so it is registered before express.json().
  app.post("/payments/razorpay/webhook", ...razorpayWebhookHandler);

  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(optionalAuth);

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/auth", authRouter);
  app.use("/catalog", catalogRouter);
  app.use("/search", searchRouter);
  app.use("/profiles", profilesRouter);
  app.use("/cinema", cinemaRouter);
  app.use("/me", meRouter);
  app.use("/playback", playbackRouter);
  app.use("/orders", ordersRouter);
  app.use("/tickets", ticketsRouter);
  app.use("/screenings", screeningsRouter);
  app.use("/snacks", snacksRouter);
  app.use("/box-office", boxOfficeRouter);
  app.use("/admin", adminRouter);
  // Artwork uploaded in development without R2 (see lib/media.ts).
  app.use("/uploads", express.static(LOCAL_UPLOAD_DIR, { immutable: true, maxAge: "1y", fallthrough: true }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
