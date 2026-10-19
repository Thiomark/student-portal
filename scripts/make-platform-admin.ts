// Grants platform admin (can add schools) to someone who has signed in once.
//   pnpm tsx scripts/make-platform-admin.ts person@example.com
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error("Usage: tsx scripts/make-platform-admin.ts <email>");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>("select id from users where email = $1", [email]);
    if (rows.length === 0) throw new Error(`No user with verified email ${email}. Sign in once first.`);
    await client.query("insert into platform_admins (user_id) values ($1) on conflict do nothing", [rows[0].id]);
    console.log(`${email} is now a platform admin.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
