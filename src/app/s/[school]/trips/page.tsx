import Link from "next/link";
import { Badge, EmptyState, NoAccess, PageHeader } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { listTrips } from "@/server/trips";

export const metadata = { title: "Trips" };

const STATUS_TONE = { planned: "gray", confirmed: "blue", completed: "green", cancelled: "red" } as const;

export default async function TripsPage({ params, searchParams }: PageProps<"/s/[school]/trips">) {
  const { school: slug } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "trips.view")) return <NoAccess />;

  const when = sp.when === "past" ? "past" : "upcoming";
  const page = Number(sp.page) || 1;
  const { rows, hasMore } = await listTrips(ctx.school.id, { when, page });
  const base = `/s/${slug}/trips`;
  const tz = ctx.school.timezone;
  const money = (cents: number) => formatMoney(cents, ctx.school.currency);
  const pageHref = (p: number) => `${base}?${new URLSearchParams({ when, page: String(p) })}`;

  return (
    <>
      <PageHeader
        title="Trips"
        actions={
          can(ctx, "trips.manage") ? (
            <Link href={`${base}/new`} className="btn-primary">
              New trip
            </Link>
          ) : null
        }
      />
      <nav className="mb-4 flex gap-2 text-sm" aria-label="Trip period">
        <Link
          href={`${base}?when=upcoming`}
          className={when === "upcoming" ? "btn-primary" : "btn-secondary"}
          aria-current={when === "upcoming" ? "page" : undefined}
        >
          Upcoming
        </Link>
        <Link
          href={`${base}?when=past`}
          className={when === "past" ? "btn-primary" : "btn-secondary"}
          aria-current={when === "past" ? "page" : undefined}
        >
          Past
        </Link>
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={when === "upcoming" ? "No upcoming trips" : "No past trips"} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Departs</th>
                <th>Cost</th>
                <th>Learners</th>
                <th>Paid in full</th>
                <th>Collected / expected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const expected = t.costCents * t.participantCount;
                return (
                  <tr key={t.id}>
                    <td>
                      <Link href={`${base}/${t.id}`} className="link font-medium">
                        {t.title}
                      </Link>
                      {t.destination ? <div className="text-xs text-slate-500">{t.destination}</div> : null}
                    </td>
                    <td className="whitespace-nowrap">{formatDateTime(t.departsAt, tz)}</td>
                    <td>
                      {money(t.costCents)}
                      {t.paymentDueOn ? (
                        <div className="text-xs text-slate-500">due {formatDate(t.paymentDueOn, "UTC")}</div>
                      ) : null}
                    </td>
                    <td>{t.participantCount}</td>
                    <td>
                      {t.paidInFullCount} / {t.participantCount}
                    </td>
                    <td className="whitespace-nowrap">
                      {money(t.collectedCents)} / {money(expected)}
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        {page > 1 ? (
          <Link href={pageHref(page - 1)} className="btn-secondary">
            Previous
          </Link>
        ) : null}
        {hasMore ? (
          <Link href={pageHref(page + 1)} className="btn-secondary">
            Next
          </Link>
        ) : null}
      </div>
    </>
  );
}
