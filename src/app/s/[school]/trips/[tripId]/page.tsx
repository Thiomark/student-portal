import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, DefinitionList, EmptyState, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDate, formatDateTime, formatMoney, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { getTrip, listParticipants, listTripGrades, listTripReminderCount, participantBalance } from "@/server/trips";
import { addGradeParticipants, remindUnpaid, updateParticipantForm } from "../actions";
import { ButtonForm } from "../forms";

const STATUS_TONE = { planned: "gray", confirmed: "blue", completed: "green", cancelled: "red" } as const;
const PAY_TONE = { paid: "green", partial: "amber", unpaid: "red", declined: "gray" } as const;
const CONSENT_TONE = { pending: "amber", given: "green", declined: "gray" } as const;

export default async function TripPage({ params, searchParams }: PageProps<"/s/[school]/trips/[tripId]">) {
  const { school: slug, tripId } = await params;
  const sp = await searchParams;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "trips.view")) return <NoAccess />;
  if (!isUuid(tripId)) notFound();

  const schoolId = ctx.school.id;
  const row = await getTrip(schoolId, tripId);
  if (!row) notFound();
  const { trip } = row;
  const [participants, grades, reminders] = await Promise.all([
    listParticipants(schoolId, tripId),
    listTripGrades(schoolId, tripId),
    listTripReminderCount(schoolId, tripId),
  ]);

  const tz = ctx.school.timezone;
  const money = (cents: number) => formatMoney(cents, ctx.school.currency);
  const base = `/s/${slug}/trips/${tripId}`;
  const manage = can(ctx, "trips.manage");
  const payments = can(ctx, "trips.payments");
  const editRows = manage || payments;
  const unpaidOnly = sp.show === "unpaid";

  const rows = participants.map((p) => ({ ...p, ...participantBalance(trip.costCents, p.paidCents, p.consent) }));
  const going = rows.filter((r) => r.consent !== "declined");
  const totals = {
    expected: going.reduce((s, r) => s + r.dueCents, 0),
    collected: rows.reduce((s, r) => s + r.paidCents, 0),
    outstanding: going.reduce((s, r) => s + Math.max(r.balanceCents, 0), 0),
    paid: going.filter((r) => r.status === "paid").length,
    partial: going.filter((r) => r.status === "partial").length,
    unpaid: going.filter((r) => r.status === "unpaid").length,
    consentGiven: rows.filter((r) => r.consent === "given").length,
    consentPending: rows.filter((r) => r.consent === "pending").length,
    declined: rows.length - going.length,
  };
  const shown = unpaidOnly ? rows.filter((r) => r.status === "unpaid" || r.status === "partial") : rows;

  return (
    <>
      <PageHeader
        title={trip.title}
        description={[trip.destination, formatDateTime(trip.departsAt, tz)].filter(Boolean).join(" · ")}
        back={{ href: "/s/" + slug + "/trips", label: "Trips" }}
        actions={
          manage ? (
            <>
              <Link href={`${base}/edit`} className="btn-secondary">
                Edit
              </Link>
              <Link href={`${base}/add`} className="btn-primary">
                Add participants
              </Link>
            </>
          ) : null
        }
      />

      <Section title="Details">
        <DefinitionList
          items={[
            ["Status", <Badge key="s" tone={STATUS_TONE[trip.status]}>{trip.status}</Badge>],
            ["Departs", formatDateTime(trip.departsAt, tz)],
            ["Returns", trip.returnsAt ? formatDateTime(trip.returnsAt, tz) : null],
            ["Cost per learner", money(trip.costCents)],
            ["Payment due", trip.paymentDueOn ? formatDate(trip.paymentDueOn, "UTC") : null],
            ["Grades", grades.length ? grades.map((g) => g.name).join(", ") : null],
            ["Organiser", row.organiserFirstName ? `${row.organiserFirstName} ${row.organiserLastName}` : null],
            ["Notes", trip.notes],
          ]}
        />
      </Section>

      <section className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Collected" value={money(totals.collected)} sub={`of ${money(totals.expected)} expected`} />
        <Stat label="Outstanding" value={money(totals.outstanding)} />
        <Stat
          label="Payments"
          value={`${totals.paid} paid`}
          sub={`${totals.partial} partial · ${totals.unpaid} unpaid`}
        />
        <Stat
          label="Consent"
          value={`${totals.consentGiven} given`}
          sub={`${totals.consentPending} pending · ${totals.declined} declined`}
        />
      </section>

      <Section
        title={`Participants (${going.length})`}
        actions={
          <div className="flex gap-2 text-sm">
            <Link href={base} className={unpaidOnly ? "link" : "font-semibold"}>
              All
            </Link>
            <Link href={`${base}?show=unpaid`} className={unpaidOnly ? "font-semibold" : "link"}>
              Not paid in full
            </Link>
          </div>
        }
      >
        {payments && totals.partial + totals.unpaid > 0 && trip.status !== "cancelled" ? (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <ButtonForm action={remindUnpaid.bind(null, slug, tripId)} label="Remind parents who haven't paid" />
            {reminders.count ? (
              <span className="text-xs text-slate-500">
                {reminders.count} reminder{reminders.count === 1 ? "" : "s"} sent, last{" "}
                {formatDateTime(reminders.lastAt, tz)}
              </span>
            ) : null}
          </div>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState title="No one on this trip yet">
            {manage ? (
              <div className="mt-2 flex flex-col items-center gap-2">
                {grades.length ? (
                  <ButtonForm
                    action={addGradeParticipants.bind(null, slug, tripId)}
                    label={`Add all learners in ${grades.map((g) => g.name).join(", ")}`}
                    className="btn-primary"
                  />
                ) : null}
                <Link href={`${base}/add`} className="link">
                  Add learners one by one
                </Link>
              </div>
            ) : null}
          </EmptyState>
        ) : shown.length === 0 ? (
          <p className="text-sm text-slate-600">Everyone has paid in full.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Learner</th>
                  <th>Class</th>
                  <th>Consent / attended</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`${base}/learners/${p.learnerId}`} className="link font-medium">
                        {fullName(p)}
                      </Link>
                    </td>
                    <td>{p.className ?? "—"}</td>
                    <td>
                      {editRows ? (
                        <form
                          action={updateParticipantForm.bind(null, slug, tripId, p.learnerId)}
                          className="flex flex-wrap items-center gap-1"
                        >
                          <select
                            name="consent"
                            defaultValue={p.consent}
                            className="input w-auto py-1"
                            aria-label="Consent"
                          >
                            <option value="pending">Pending</option>
                            <option value="given">Given</option>
                            <option value="declined">Declined</option>
                          </select>
                          <select
                            name="attended"
                            defaultValue={p.attended === null ? "" : p.attended ? "yes" : "no"}
                            className="input w-auto py-1"
                            aria-label="Attended"
                          >
                            <option value="">Attended?</option>
                            <option value="yes">Attended</option>
                            <option value="no">Absent</option>
                          </select>
                          <button className="text-sm text-brand-700 hover:underline">Save</button>
                        </form>
                      ) : (
                        <>
                          <Badge tone={CONSENT_TONE[p.consent]}>{p.consent}</Badge>{" "}
                          {p.attended === null ? null : p.attended ? "attended" : "absent"}
                        </>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">{money(p.paidCents)}</td>
                    <td className="text-right whitespace-nowrap">
                      {p.balanceCents < 0 ? (
                        <span className="text-amber-700">{money(-p.balanceCents)} credit</span>
                      ) : (
                        money(p.balanceCents)
                      )}
                    </td>
                    <td>
                      <Badge tone={PAY_TONE[p.status]}>{p.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}
