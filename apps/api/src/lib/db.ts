import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";

/**
 * Builds a client for a Postgres URL. A `?schema=` parameter (as understood by
 * the Prisma CLI) selects a non-public schema, which lets tests share a
 * database server with development without touching its data.
 */
export function createPrisma(databaseUrl: string, poolMax?: number) {
  const url = new URL(databaseUrl);
  const schema = url.searchParams.get("schema") ?? undefined;
  url.searchParams.delete("schema");
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), ...(poolMax && { max: poolMax }) }, { schema }),
  });
}

export const prisma = createPrisma(config.DATABASE_URL, config.DATABASE_POOL_MAX);
