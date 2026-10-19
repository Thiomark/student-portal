import { execSync } from "node:child_process";
import { Client } from "pg";

// Integration tests run against TEST_DATABASE_URL, recreated from the
// migrations on every run. Without it, they are skipped.
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await client.end();
  execSync("pnpm drizzle-kit migrate", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}
