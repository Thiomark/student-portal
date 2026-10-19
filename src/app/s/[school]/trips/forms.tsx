"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, TRIP_STATUSES } from "@/lib/validation/trips";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

type Trip = {
  title: string;
  destination: string | null;
  departsAt: string;
  returnsAt: string | null;
  cost: string;
  paymentDueOn: string | null;
  status: string;
  notes: string | null;
};

export function TripForm({
  action,
  trip,
  grades,
  gradeIds,
  submitLabel,
}: {
  action: Action;
  trip?: Trip;
  grades: { id: string; name: string }[];
  gradeIds: string[];
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="title" label="Title">
          <input id="title" name="title" className="input" defaultValue={trip?.title} required />
        </Field>
        <Field name="destination" label="Destination">
          <input id="destination" name="destination" className="input" defaultValue={trip?.destination ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="departsAt" label="Departs">
          <input
            id="departsAt"
            name="departsAt"
            type="datetime-local"
            className="input"
            defaultValue={trip?.departsAt}
            required
          />
        </Field>
        <Field name="returnsAt" label="Returns">
          <input
            id="returnsAt"
            name="returnsAt"
            type="datetime-local"
            className="input"
            defaultValue={trip?.returnsAt ?? ""}
          />
        </Field>
        <Field name="status" label="Status">
          <select id="status" name="status" className="input" defaultValue={trip?.status ?? "planned"}>
            {TRIP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="cost" label="Cost per learner (R)">
          <input
            id="cost"
            name="cost"
            inputMode="decimal"
            className="input"
            placeholder="0.00"
            defaultValue={trip?.cost ?? ""}
          />
        </Field>
        <Field name="paymentDueOn" label="Payment due by">
          <input
            id="paymentDueOn"
            name="paymentDueOn"
            type="date"
            className="input"
            defaultValue={trip?.paymentDueOn ?? ""}
          />
        </Field>
      </div>
      <Field name="gradeIds[]" label="Grades going" hint="Used by “Add all learners in these grades”.">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {grades.length === 0 ? <span className="text-slate-500">No grades set up yet.</span> : null}
          {grades.map((g) => (
            <label key={g.id} className="flex items-center gap-1.5">
              <input type="checkbox" name="gradeIds[]" value={g.id} defaultChecked={gradeIds.includes(g.id)} />
              {g.name}
            </label>
          ))}
        </div>
      </Field>
      <Field name="notes" label="Notes">
        <textarea id="notes" name="notes" rows={3} className="input" defaultValue={trip?.notes ?? ""} />
      </Field>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

export function PaymentForm({ action, balance }: { action: Action; balance: string }) {
  return (
    <ActionForm action={action} className="space-y-3" resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field name="amount" label="Amount (R)">
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            className="input"
            defaultValue={balance}
            required
          />
        </Field>
        <Field name="method" label="Method">
          <select id="method" name="method" className="input" defaultValue="cash">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="reference" label="Reference / receipt no.">
          <input id="reference" name="reference" className="input" />
        </Field>
      </div>
      <SubmitButton>Record payment</SubmitButton>
    </ActionForm>
  );
}

// A button-only form whose result message is worth showing.
export function ButtonForm({
  action,
  label,
  className = "btn-secondary",
}: {
  action: (state: FormState) => Promise<FormState>;
  label: string;
  className?: string;
}) {
  return (
    <ActionForm action={action}>
      <SubmitButton className={className}>{label}</SubmitButton>
    </ActionForm>
  );
}

export function ConfirmButton({
  run,
  confirmText,
  label,
  className = "text-sm text-red-700 hover:underline",
}: {
  run: () => Promise<FormState>;
  confirmText: string;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() => {
        if (!confirm(confirmText)) return;
        start(async () => {
          const result = await run();
          if (result?.ok === false) alert(result.error);
          else if (result?.ok && result.redirectTo) router.push(result.redirectTo);
          else router.refresh();
        });
      }}
    >
      {label}
    </button>
  );
}
