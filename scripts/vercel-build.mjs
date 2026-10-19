// Vercel runs this instead of `build` (package.json "vercel-build"): apply any
// new migrations, then build. With Neon's Vercel integration every preview
// deployment gets its own database branch, so a PR's migration never touches
// production until it's merged.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

if (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED) {
  run("pnpm drizzle-kit migrate");
} else {
  console.warn("[vercel-build] No DATABASE_URL set; skipping migrations.");
}
run("pnpm next build");
