import { and, count, eq, gte, isNull, lt, lte, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { can, getSchoolContext } from "@/lib/auth/context";
import type { Capability } from "@/lib/permissions";

type Tile = { label: string; value: number; href: string; tone?: "warn" };

export default async function OverviewPage({ params }: PageProps<"/s/[school]">) {
  const { school: slug } = await params;
  const ctx = await getSchoolContext(slug);
  const db = getDb();
  const s = schema;
  const schoolId = ctx.school.id;
  const base = `/s/${slug}`;
  const now = new Date();
  const inAWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);

  // Each tile only runs its query when the viewer may see that area.
  const tiles: [Capability, () => Promise<Tile>][] = [
    [
      "learners.view",
      async () => ({
        label: "Active learners",
        href: `${base}/learners`,
        value: await one(
          db
            .select({ n: count() })
            .from(s.learners)
            .where(and(eq(s.learners.schoolId, schoolId), eq(s.learners.status, "active"), isNull(s.learners.deletedAt))),
        ),
      }),
    ],
    [
      "guardians.view",
      async () => ({
        label: "Learners with no parent on file",
        href: `${base}/learners`,
        tone: "warn",
        value: await one(
          db
            .select({ n: count() })
            .from(s.learners)
            .where(
              and(
                eq(s.learners.schoolId, schoolId),
                eq(s.learners.status, "active"),
                isNull(s.learners.deletedAt),
                sql`not exists (select 1 from ${s.learnerGuardians} lg where lg.learner_id = "learners"."id")`,
              ),
            ),
        ),
      }),
    ],
    [
      "textbooks.view",
      async () => ({
        label: "Textbooks out",
        href: `${base}/textbooks`,
        value: await one(
          db
            .select({ n: count() })
            .from(s.textbookLoans)
            .where(and(eq(s.textbookLoans.schoolId, schoolId), isNull(s.textbookLoans.returnedAt))),
        ),
      }),
    ],
    [
      "textbooks.view",
      async () => ({
        label: "Textbooks overdue",
        href: `${base}/textbooks`,
        tone: "warn",
        value: await one(
          db
            .select({ n: count() })
            .from(s.textbookLoans)
            .where(
              and(
                eq(s.textbookLoans.schoolId, schoolId),
                isNull(s.textbookLoans.returnedAt),
                lt(s.textbookLoans.dueOn, today),
              ),
            ),
        ),
      }),
    ],
    [
      "meetings.view",
      async () => ({
        label: "Parent meetings this week",
        href: `${base}/meetings`,
        value: await one(
          db
            .select({ n: count() })
            .from(s.meetings)
            .where(
              and(
                eq(s.meetings.schoolId, schoolId),
                eq(s.meetings.status, "scheduled"),
                gte(s.meetings.scheduledAt, now),
                lte(s.meetings.scheduledAt, inAWeek),
                isNull(s.meetings.deletedAt),
              ),
            ),
        ),
      }),
    ],
    [
      "messages.send",
      async () => ({
        label: "Messages to print or call",
        href: `${base}/messages`,
        tone: "warn",
        value: await one(
          db
            .select({ n: count() })
            .from(s.messages)
            .where(and(eq(s.messages.schoolId, schoolId), eq(s.messages.status, "needs_action"))),
        ),
      }),
    ],
    [
      "incidents.view",
      async () => ({
        label: "Open incidents",
        href: `${base}/incidents`,
        value: await one(
          db
            .select({ n: count() })
            .from(s.incidents)
            .where(and(eq(s.incidents.schoolId, schoolId), eq(s.incidents.status, "open"), isNull(s.incidents.deletedAt))),
        ),
      }),
    ],
    [
      "maintenance.view",
      async () => ({
        label: "Open maintenance jobs",
        href: `${base}/maintenance`,
        value: await one(
          db
            .select({ n: count() })
            .from(s.maintenanceRequests)
            .where(
              and(
                eq(s.maintenanceRequests.schoolId, schoolId),
                sql`${s.maintenanceRequests.status} in ('open', 'in_progress')`,
                isNull(s.maintenanceRequests.deletedAt),
              ),
            ),
        ),
      }),
    ],
  ];

  const visible = await Promise.all(tiles.filter(([cap]) => can(ctx, cap)).map(([, load]) => load()));

  return (
    <>
      <PageHeader title={`Hello${ctx.user.name ? `, ${ctx.user.name.split(" ")[0]}` : ""}`} description={ctx.school.name} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {visible.map((t) => (
          <Link key={t.label} href={t.href} className="card p-4 hover:border-brand-600">
            <p className={`text-3xl font-semibold ${t.tone === "warn" && t.value > 0 ? "text-amber-700" : ""}`}>
              {t.value}
            </p>
            <p className="mt-1 text-sm text-slate-600">{t.label}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {can(ctx, "textbooks.issue") ? (
          <a href={`${base}/desk`} className="btn-primary">
            Open textbook desk
          </a>
        ) : null}
        {can(ctx, "incidents.report") ? (
          <Link href={`${base}/incidents/new`} className="btn-secondary">
            Report an incident
          </Link>
        ) : null}
        {can(ctx, "maintenance.report") ? (
          <Link href={`${base}/maintenance/new`} className="btn-secondary">
            Report a maintenance issue
          </Link>
        ) : null}
      </div>
    </>
  );
}

async function one(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.n ?? 0;
}
