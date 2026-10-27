import { createApp } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./lib/db.js";
import { startPublishingSchedule } from "./lib/publishing.js";

const server = createApp().listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
startPublishingSchedule();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => void prisma.$disconnect().finally(() => process.exit(0)));
  });
}
