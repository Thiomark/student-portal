import { and, desc, eq, lt, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/db/client";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/ids";

export const metadata = { title: "Activity log" };

const PAGE = 100;
const AREAS = [
  "learners",
  "guardians",
  "classes",
  "textbooks",
  "meetings",
  "messages",
  "incidents",
  "trips",
  "maintenance",
  "staff",
  "settings",
];

const { activityEvents: a } = schema;

export default async function ActivityPage({ params, searchParams }: PageProps<"/s/[school]/activity">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "activity.view")) return <NoAccess />;

  const area = typeof sp.area === "string" && AREAS.includes(sp.area) ? sp.area : "";
  const entity = isUuid(sp.entity) ? sp.entity : null;
  const actor = isUuid(sp.actor) ? sp.actor : null;
  // Keyset pagination on (created_at, id): stable while new events arrive.
  const before = typeof sp.before === "string" ? sp.before.split("_") : null;

  const where: SQL[] = [eq(a.schoolId, ctx.school.id)];
  if (area) where.push(eq(a.area, area));
  if (entity) where.push(eq(a.entityId, entity));
  if (actor) where.push(eq(a.actorUserId, actor));
  if (before && before.length === 2 && isUuid(before[1]) && !Number.isNaN(Date.parse(before[0]))) {
    const at = new Date(before[0]);
    where.push(or(lt(a.createdAt, at), and(eq(a.createdAt, at), lt(a.id, before[1])))!);
  }

  const rows = await getDb()
    .select()
    .from(a)
    .where(and(...where))
    .orderBy(desc(a.createdAt), desc(a.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  const tz = ctx.school.timezone;
  const base = `/s/${slug}/activity`;
  const nextHref =
    rows.length > PAGE && last
      ? `${base}?${new URLSearchParams({
          ...(area && { area }),
          ...(entity && { entity }),
          ...(actor && { actor }),
          before: `${last.createdAt.toISOString()}_${last.id}`,
        })}`
      : null;

  return (
    <>
      <PageHeader title="Activity log" description="Every change, who made it and when." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="area" defaultValue={area} className="input w-auto">
          <option value="">All areas</option>
          {AREAS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        {entity ? <input type="hidden" name="entity" value={entity} /> : null}
        {actor ? <input type="hidden" name="actor" value={actor} /> : null}
        <button className="btn-secondary">Filter</button>
        {entity || actor ? (
          <Link href={base} className="btn-secondary">
            Clear
          </Link>
        ) : null}
      </form>
      {page.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>What</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {page.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-slate-600">{formatDateTime(e.createdAt, tz)}</td>
                  <td>
                    {e.actorUserId ? (
                      <Link href={`${base}?actor=${e.actorUserId}`} className="link">
                        {e.actorName ?? "Unknown"}
                      </Link>
                    ) : (
                      "System"
                    )}
                    <div className="text-xs text-slate-500">{e.actorRole}</div>
                  </td>
                  <td>
                    <span className="font-mono text-xs">{e.action}</span>
                    <div>
                      {e.entityId ? (
                        <Link href={`${base}?entity=${e.entityId}`} className="link">
                          {e.subject ?? e.entityType}
                        </Link>
                      ) : (
                        e.subject
                      )}
                    </div>
                  </td>
                  <td className="text-xs">
                    {e.changes?.length ? (
                      <details>
                        <summary className="cursor-pointer">{e.changes.length} field(s) changed</summary>
                        <ul className="mt-1 space-y-0.5">
                          {e.changes.map((c) => (
                            <li key={c.field}>
                              <span className="font-medium">{c.field}</span>: {display(c.before)} → {display(c.after)}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {e.meta?.viaSync ? <span className="badge bg-slate-100 text-slate-700">offline device</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextHref ? (
        <Link href={nextHref} className="btn-secondary mt-4">
          Older
        </Link>
      ) : null}
    </>
  );
}

function display(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
