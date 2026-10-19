import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Generate SQL with `pnpm db:generate`, review it, commit it, then apply with
// `pnpm db:migrate`. Never `drizzle-kit push` against a shared database.
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
