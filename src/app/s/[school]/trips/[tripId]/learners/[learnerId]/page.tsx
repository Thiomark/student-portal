import { notFound } from "next/navigation";
import { Badge, DefinitionList, NoAccess, PageHeader, Section } from "@/components/ui";
import { can, getSchoolContext } from "@/lib/auth/context";
import { formatDateTime, formatMoney, fullName } from "@/lib/format";
import { isUuid } from "@/lib/ids";
import { PAYMENT_METHOD_LABELS } from "@/lib/validation/trips";
import { getParticipant, getTrip, listLearnerPayments, participantBalance } from "@/server/trips";
import { recordPayment, removeParticipant, reversePayment } from "../../../actions";
import { ConfirmButton, PaymentForm } from "../../../forms";

const PAY_TONE = { paid: "green", partial: "amber", unpaid: "red", declined: "gray" } as const;

export default async function TripParticipantPage({
  params,
}: PageProps<"/s/[school]/trips/[tripId]/learners/[learnerId]">) {
  const { school: slug, tripId, learnerId } = await params;
  const ctx = await getSchoolContext(slug);
  if (!can(ctx, "trips.view")) return <NoAccess />;
  if (!isUuid(tripId) || !isUuid(learnerId)) notFound();

  const schoolId = ctx.school.id;
  const [row, participant, payments] = await Promise.all([
    getTrip(schoolId, tripId),
    getParticipant(schoolId, tripId, learnerId),
    listLearnerPayments(schoolId, tripId, learnerId),
  ]);
  if (!row || !participant) notFound();
  const { trip } = row;

  const tz = ctx.school.timezone;
  const money = (cents: number) => formatMoney(cents, ctx.school.currency);
  const { dueCents, balanceCents, status } = participantBalance(trip.costCents, participant.paidCents, participant.consent);
  const reversed = new Set(payments.map((p) => p.reversesPaymentId).filter(Boolean));
  const takePayments = can(ctx, "trips.payments");

  return (
    <>
      <PageHeader
        title={fullName(participant)}
        description={`${trip.title}${participant.className ? ` · Class ${participant.className}` : ""}`}
        back={{ href: `/s/${slug}/trips/${tripId}`, label: "Back to trip" }}
        actions={
          can(ctx, "trips.manage") && payments.length === 0 ? (
            <ConfirmButton
              run={removeParticipant.bind(null, slug, tripId, learnerId)}
              confirmText="Take this learner off the trip?"
              label="Remove from trip"
              className="btn-danger"
            />
          ) : null
        }
      />

      <Section title="Balance">
        <DefinitionList
          items={[
            ["Status", <Badge key="s" tone={PAY_TONE[status]}>{status}</Badge>],
            ["Consent", participant.consent],
            ["Due", money(dueCents)],
            ["Paid", money(participant.paidCents)],
            ["Balance", balanceCents < 0 ? `${money(-balanceCents)} credit (refund due)` : money(balanceCents)],
            ["Attended", participant.attended === null ? null : participant.attended ? "Yes" : "No"],
          ]}
        />
      </Section>

      {takePayments && balanceCents > 0 ? (
        <Section title="Record payment">
          <PaymentForm action={recordPayment.bind(null, slug, tripId, learnerId)} balance={(balanceCents / 100).toFixed(2)} />
        </Section>
      ) : null}

      <Section title="Payment history">
        {payments.length === 0 ? (
          <p className="text-sm text-slate-600">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Amount</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Captured by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className={p.reversesPaymentId || reversed.has(p.id) ? "text-slate-500" : undefined}>
                    <td className="whitespace-nowrap">{formatDateTime(p.paidAt, tz)}</td>
                    <td className="text-right whitespace-nowrap">{money(p.amountCents)}</td>
                    <td>{PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td>{p.reference ?? "—"}</td>
                    <td>{p.receivedByFirstName ? `${p.receivedByFirstName} ${p.receivedByLastName}` : "—"}</td>
                    <td>
                      {p.reversesPaymentId ? (
                        <Badge>reversal</Badge>
                      ) : reversed.has(p.id) ? (
                        <Badge tone="red">reversed</Badge>
                      ) : takePayments ? (
                        <ConfirmButton
                          run={reversePayment.bind(null, slug, tripId, learnerId, p.id)}
                          confirmText={`Reverse this payment of ${money(p.amountCents)}? A negative entry will be added.`}
                          label="Reverse"
                        />
                      ) : null}
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
