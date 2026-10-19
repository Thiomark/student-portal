import "server-only";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";
import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  // Neon in deployed environments; plain Postgres for local dev and tests
  // (DATABASE_DRIVER=pg) so nobody needs a Neon branch to run the app.
  if (process.env.DATABASE_DRIVER === "pg") {
    return drizzlePg(new PgPool({ connectionString: url, max: 10 }), { schema });
  }
  neonConfig.webSocketConstructor = ws;
  return drizzleNeon(new NeonPool({ connectionString: url }), { schema });
}

type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { __db?: Db };

// One pool per server process; dev hot reload would otherwise leak pools.
export function getDb(): Db {
  globalForDb.__db ??= createDb();
  return globalForDb.__db;
}

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
