# SchoolOS architecture

SchoolOS is a multi-tenant school management system. One deployment serves many
schools. Each school's data is separated by `school_id`.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| App | Next.js 16 (App Router, server actions), React 19 | Server-rendered pages keep client JS small for old laptops |
| Styling | Tailwind 4, system fonts, no UI kit | Nothing heavy to download on slow links |
| Auth | Clerk (email, phone/SMS codes, Google) | Identity only. Access comes from our own tables |
| Database | Postgres on Neon, Drizzle ORM, SQL migrations | Branching for previews; plain Postgres locally |
| WhatsApp | Whaple, one API key per school | Messages come from the school's own number |
| Email | Resend (platform key, or the school's own) | |
| Offline | Service worker, IndexedDB (Dexie) and an outbox | The textbook desk works without a connection |

## Tenancy

- A **school** is the tenant. URLs are `/s/<school-slug>/...`, so a teacher at
  two schools can have both open in different tabs.
- Every school-owned table has `school_id`, and every query filters on it.
  `getSchoolContext(slug)` resolves the school and the caller's membership
  together. Without an active membership the page returns 404, not 403, so
  school slugs can't be probed.
- Adding a school is a form on `/platform`, available only to platform admins
  (`pnpm platform:admin you@example.com`). The form creates the school, its
  current academic year and Grades R–12 if wanted, and invites the principal as
  owner. Platform admins get **no** read access to school data.

## Who can do what

```
users (one per Clerk identity)
 ├─ memberships ── school, role (owner | admin | staff), permissions {preset, grant, revoke}
 └─ guardians.user_id ── parent portal access, per school
```

- **Owner/admin** hold every capability. **Staff** start from a preset
  (teacher, office, textbooks, finance, facilities) with per-person grants and
  revokes. The registry is `src/lib/permissions.ts`.
- `staff.manage` and `school.settings` can't be granted to staff, so nobody can
  widen their own access.
- **Staff invites** are accepted by signing in with the invited email once
  Clerk has verified it. No token is sent, so there is nothing to forward or
  leak.
- **Parents** are linked automatically when the school has their email or
  cellphone on file and Clerk has verified the same one at sign-in. A parent
  with children at two schools sees both in `/portal`.

## Parents, guardians and contact details

- A learner has zero or more guardians, and a guardian has zero or more
  learners (`learner_guardians`). The link records the relationship, primary
  contact, lives-with, may-collect and gets-notices.
- Each phone number records what it can do: `whatsapp`, `sms`, `voice`. This
  covers a WhatsApp-only number, a landline that only takes calls, and a
  cellphone that does all three.
- `chooseRoute` picks a channel per guardian. It uses their preference if they
  can be reached that way. Otherwise it tries WhatsApp, then email, then SMS,
  then a call, and finally a printed letter.
- WhatsApp and email go out automatically. SMS (no provider yet), calls and
  letters become `needs_action` messages for the office to work through.

### Delivery queue

`notifyGuardians` only writes rows; nothing waits on WhatsApp or email.

1. WhatsApp and email rows are saved as `queued`. The action returns at once.
2. `after()` starts the worker (`src/lib/messaging/delivery.ts`) once the
   response has gone out. It sends five at a time within a 45-second budget.
3. Any rows left over go to `GET /api/cron/messages`. Vercel Cron calls it
   every 5 minutes (`vercel.json`) with `CRON_SECRET`. It also:
   - sends retries that are due;
   - puts rows stuck in `sending` for 10+ minutes back in the queue;
   - asks Whaple about recent WhatsApps and records `delivered` and `read`
     (Whaple has no webhooks).
4. Workers claim rows with `FOR UPDATE SKIP LOCKED`, so the `after()` run and
   the cron can overlap without sending anything twice.
5. Temporary errors go back to `queued` with backoff: 1 min, 5 min, 30 min,
   2 h. Temporary means network failures, 429s, 5xx, or the school's WhatsApp
   phone being offline. After 5 attempts the row becomes `failed`.
6. Permanent errors (bad number, invalid key) fail at once.
7. Email uses the message id as Resend's idempotency key.

On Vercel's Hobby plan, cron runs at most daily. Use Pro, or point any
external scheduler at the endpoint.

## Activity log

Every mutation calls `recordActivity` after it commits. Each entry records
who, their role, the action (`area.verb`), the entity, a human label, and
field-level `changes`. The table has no foreign keys, so the history outlives
deleted rows. Contact details, ID numbers and medical notes are never written
to the log.

## Offline-first textbook desk

Issuing and returning books is the busiest, most connection-sensitive task, so
it works fully offline:

1. `/s/<slug>/desk` HTML holds no learner data. `proxy.ts` marks it
   `x-offline-shell`, and `public/sw.js` caches it and its scripts.
2. On load, the desk pulls a snapshot into IndexedDB (`GET /api/s/<slug>/sync`):
   active learners, all book copies and open loans. After that it pulls only
   changes since a cursor. Each pull re-reads a 60-second window before the
   cursor so transactions that commit late aren't missed.
3. Each issue or return is written locally and queued in an outbox with a
   UUIDv7 id. Ids are minted on the device, so a loan created offline keeps
   its id.
4. `POST /api/s/<slug>/sync` applies queued changes in order. Each one runs in
   its own transaction and is recorded in `sync_mutations`, so a resend after
   a lost response is a no-op (`duplicate`).
5. Conflicts are rejected, not merged. One example: the same book issued on two
   offline devices. A unique index allows one open loan per copy. The desk
   shows rejected items for a person to resolve, then re-pulls a full snapshot.

Everything else uses ordinary server-rendered pages, with Next's
`experimental.useOffline`. That flag holds navigations and form submits while
the connection drops and retries them when it returns. Other modules can move
to the same outbox pattern as needed (see ROADMAP).

On shared laptops, "Remove school data from this device" on the desk clears
IndexedDB and the cached pages.

## Data conventions

- Ids: UUIDv7 (`src/lib/ids.ts`). Money: integer cents. Times: `timestamptz`,
  shown in the school's timezone.
- Synced tables soft-delete (`deleted_at`) so devices learn about removals.
- Trip payments are append-only. A mistake is corrected with a reversing
  entry.
- Migrations live in `migrations/` and are generated by drizzle-kit and
  reviewed before commit. Never use `drizzle-kit push` on a shared database.

## Patterns carried over from luxefash-admin

- Clerk for identity only; membership rows decide access on every request; no
  super-admin bypass.
- Capability strings with role presets plus per-person grant/revoke, and
  ungrantable capabilities.
- Per-tenant provider keys encrypted at rest with AES-256-GCM.
- `recordActivity` after commit, which never fails the user's action.
- Whaple client (`x-api-key`, `POST /api/messages`, poll for status) and
  Resend with a platform sender fallback.
