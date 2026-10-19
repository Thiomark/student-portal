import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Generate SQL with `pnpm db:generate`, review it, commit it, then apply with
// `pnpm db:migrate` (Vercel builds run it automatically). Never
// `drizzle-kit push` against a shared database.
//
// Migrations use Neon's direct (unpooled) connection when it's available; the
// pooler can drop the session mid-migration.
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
