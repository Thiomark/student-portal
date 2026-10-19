"use client";

import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";
import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_LABELS, INCIDENT_SEVERITIES } from "@/lib/validation/incidents";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

type Incident = {
  occurredAt: string;
  category: string;
  severity: string;
  description: string;
  actionTaken: string | null;
};

export function IncidentForm({
  action,
  incident,
  learnerId,
  maxOccurredAt,
  submitLabel,
}: {
  action: Action;
  incident: Incident;
  learnerId?: string;
  maxOccurredAt: string;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4" resetOnSuccess={Boolean(learnerId)}>
      {learnerId ? <input type="hidden" name="learnerId" value={learnerId} /> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="occurredAt" label="When">
          <input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
            className="input"
            defaultValue={incident.occurredAt}
            max={maxOccurredAt}
            required
          />
        </Field>
        <Field name="category" label="Category">
          <select id="category" name="category" className="input" defaultValue={incident.category} required>
            <option value="" disabled>
              Choose…
            </option>
            {INCIDENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INCIDENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="severity" label="Severity">
          <select id="severity" name="severity" className="input" defaultValue={incident.severity}>
            {INCIDENT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field name="description" label="What happened" hint="Stick to facts: who, where, what was seen or heard.">
        <textarea
          id="description"
          name="description"
          rows={5}
          className="input"
          defaultValue={incident.description}
          required
        />
      </Field>
      <Field name="actionTaken" label="Action taken" hint="Optional for now; needed when resolving.">
        <textarea id="actionTaken" name="actionTaken" rows={3} className="input" defaultValue={incident.actionTaken ?? ""} />
      </Field>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

export function ResolveForm({ action, actionTaken }: { action: Action; actionTaken: string | null }) {
  return (
    <ActionForm action={action} className="space-y-3">
      <Field name="actionTaken" label="Action taken">
        <textarea id="actionTaken" name="actionTaken" rows={3} className="input" defaultValue={actionTaken ?? ""} required />
      </Field>
      <SubmitButton>Mark resolved</SubmitButton>
    </ActionForm>
  );
}

export function NotifyForm({
  action,
  subject,
  text,
  alreadyNotified,
}: {
  action: Action;
  subject: string;
  text: string;
  alreadyNotified: boolean;
}) {
  return (
    <ActionForm action={action} className="space-y-3">
      <Field name="subject" label="Subject">
        <input id="subject" name="subject" className="input" defaultValue={subject} required />
      </Field>
      <Field name="text" label="Message" hint="Check it before sending. Avoid naming other learners.">
        <textarea id="text" name="text" rows={6} className="input" defaultValue={text} required />
      </Field>
      <SubmitButton className="btn-secondary">{alreadyNotified ? "Notify parents again" : "Notify parents"}</SubmitButton>
    </ActionForm>
  );
}
