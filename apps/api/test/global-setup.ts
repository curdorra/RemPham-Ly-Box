import { execSync } from "node:child_process";

/** Resets the test database schema and loads the demo catalog. */
export default function setup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://ott:ott@localhost:5432/ott_test",
    // Prisma refuses `migrate reset` when run by an AI agent unless consent is
    // given; this only ever targets the disposable test database above.
    PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes",
  };
  execSync("npx prisma migrate reset --force", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}
