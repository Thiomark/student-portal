<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SchoolOS conventions

Multi-tenant school management. Next.js 16 (App Router, server actions), Clerk
for identity, Postgres on Neon via Drizzle. Read `docs/ARCHITECTURE.md` first.

## Tenancy and access (non-negotiable)

- A school is the tenant. Every school-owned table has `school_id`, and every
  query filters on `ctx.school.id`. Never look a row up by id alone.
- Pages and actions get the tenant with `getSchoolContext(slug)` from
  `src/lib/auth/context.ts`. Users without an active membership get a 404.
- Check a capability (`src/lib/permissions.ts`) on every page (`can(ctx, ...)`
  → `<NoAccess />`) and every action (`schoolAction(slug, capability, fn)`).
  Hiding a button is not access control.
- There is no super-admin bypass. Platform admins can create schools; they do
  not get to read school data.

## Writing a module

Follow `src/app/s/[school]/learners` and `.../guardians`:

- `page.tsx` server components query with Drizzle directly or via
  `src/server/*.ts` helpers.
- `actions.ts` (`"use server"`) wraps each mutation in `schoolAction`, parses
  input with a zod schema from `src/lib/validation/*`, writes in a transaction
  when there is more than one statement, then calls `recordActivity(ctx, ...)`
  after commit. Action names are `<area>.<past-tense-verb>`.
- Forms are client components using `ActionForm`/`Field` from
  `src/components/action-form.tsx`; bind server actions with
  `action.bind(null, slug, id)`.
- Ids are UUIDv7 from `src/lib/ids.ts`. Money is integer cents. Times are
  `timestamptz`, shown with `formatDate*` in the school's timezone.
- Soft-delete (`deleted_at`) synced tables; filter `isNull(deletedAt)`.
- Never put phone numbers, emails, ID numbers or medical notes in activity
  `subject`/`changes`/`meta` (use `maskPhone`, or redact in `diffFields`).

## Messaging

`notifyGuardians` (`src/lib/messaging/notify.ts`) picks WhatsApp (Whaple) →
email (Resend) → SMS/call/letter per guardian using `chooseRoute`. Channels
that can't be sent automatically become `needs_action` messages for the office.

## Performance budget

Schools run old laptops on slow links. No UI kits, icon packs or web fonts;
Tailwind and system fonts only. Prefer server components; ship client JS only
for interactivity. Paginate lists (50 rows).

## Database

Change `src/db/schema/*`, run `pnpm db:generate`, review and commit the SQL in
`migrations/`, apply with `pnpm db:migrate`. Never `drizzle-kit push` against a
shared database.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
