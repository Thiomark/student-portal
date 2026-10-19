# SchoolOS

School management for South African schools. It covers learners and their
parents, textbooks, parent meetings, WhatsApp and letters home, incidents,
trips, maintenance, and a full log of who changed what.

It is multi-tenant: one deployment serves many schools. It is built for old
laptops and slow connections, and the textbook desk works offline.

- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- What's built and what's next: [docs/ROADMAP.md](docs/ROADMAP.md)
- Conventions for contributors and agents: [AGENTS.md](AGENTS.md)

> This repository used to hold an Angular student-portal prototype. It is
> still on the `main` branch history.

## Run it locally

Requires Node 22, pnpm and Postgres 16 (local or a Neon branch).

```bash
pnpm install
cp .env.example .env.local      # fill in Clerk keys and SECRETS_ENCRYPTION_KEY
# For local Postgres: DATABASE_URL=postgres://... and DATABASE_DRIVER=pg
cp .env.local .env              # drizzle-kit and scripts read .env
pnpm db:migrate
pnpm db:seed you@example.com    # demo school; you become its owner on sign-in
pnpm dev
```

Sign in at http://localhost:3000 with the email you seeded. You land in
**Demo High School**.

To add more schools, make yourself a platform admin and use `/platform`:

```bash
pnpm platform:admin you@example.com   # after signing in once
```

## Checks

```bash
pnpm lint
pnpm typecheck
TEST_DATABASE_URL=postgres://...school_test pnpm test   # integration tests need a throwaway DB
pnpm build
```

## Deploying

The app suits Vercel plus Neon. Set the variables from `.env.example`. Run
`pnpm db:migrate` against the production database before each deploy that
includes a new migration. Each school adds its own Whaple key under
**Settings → WhatsApp and email**.
