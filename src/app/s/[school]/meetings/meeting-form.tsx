"use client";

import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";
import { MEETING_MODES, MEETING_MODE_LABELS } from "@/lib/validation/meetings";

type Option = { id: string; name: string };
export type GuardianOption = Option & { detail: string; channelLabel: string; checked: boolean };

type Meeting = {
  title: string;
  purpose: string | null;
  durationMinutes: number;
  location: string | null;
  mode: string;
};

export function MeetingForm({
  action,
  learner,
  guardians,
  staff,
  selectedStaffIds = [],
  organiserStaffId,
  meeting,
  schedule,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  learner?: Option | null;
  guardians: GuardianOption[];
  staff: Option[];
  selectedStaffIds?: string[];
  organiserStaffId?: string | null;
  meeting?: Meeting;
  // Only when creating: the time (rescheduling is its own step) and whether to notify.
  schedule?: { defaultScheduledAt?: string };
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      {learner && schedule ? <input type="hidden" name="learnerId" value={learner.id} /> : null}
      <Field name="title" label="Title">
        <input
          id="title"
          name="title"
          className="input"
          required
          maxLength={200}
          placeholder="e.g. Progress discussion"
          defaultValue={meeting?.title}
        />
      </Field>
      <Field name="purpose" label="Purpose" hint="Included in the message to parents.">
        <textarea id="purpose" name="purpose" rows={2} className="input" defaultValue={meeting?.purpose ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        {schedule ? (
          <Field name="scheduledAt" label="Date and time">
            <input
              id="scheduledAt"
              name="scheduledAt"
              type="datetime-local"
              className="input"
              required
              defaultValue={schedule.defaultScheduledAt}
            />
          </Field>
        ) : null}
        <Field name="durationMinutes" label="Duration (minutes)">
          <input
            id="durationMinutes"
            name="durationMinutes"
            type="number"
            min={5}
            max={480}
            step={5}
            className="input"
            defaultValue={meeting?.durationMinutes ?? 30}
          />
        </Field>
        <Field name="mode" label="How">
          <select id="mode" name="mode" className="input" defaultValue={meeting?.mode ?? "in_person"}>
            {MEETING_MODES.map((m) => (
              <option key={m} value={m}>
                {MEETING_MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="location" label="Location or link" hint="e.g. Principal's office, or a video link.">
          <input id="location" name="location" className="input" defaultValue={meeting?.location ?? ""} />
        </Field>
        <Field name="organiserStaffId" label="Organiser">
          <select id="organiserStaffId" name="organiserStaffId" className="input" defaultValue={organiserStaffId ?? ""}>
            <option value="">—</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field name="guardianIds[]" label="Parents attending">
        {guardians.length === 0 ? (
          <p className="text-sm text-slate-600">
            {learner ? "This learner has no linked parents." : "Pick a learner to invite their parents."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {guardians.map((g) => (
              <li key={g.id}>
                <label className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="checkbox" name="guardianIds[]" value={g.id} defaultChecked={g.checked} />
                  <span className="font-medium">{g.name}</span>
                  <span className="text-slate-500">{g.detail}</span>
                  <span className="text-xs text-slate-500">· {g.channelLabel}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Field>

      {staff.length ? (
        <Field name="staffIds[]" label="Staff attending" hint="Besides the organiser, e.g. class teacher or counsellor.">
          <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-2">
            <ul className="grid gap-1 sm:grid-cols-2">
              {staff.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="staffIds[]"
                      value={s.id}
                      defaultChecked={selectedStaffIds.includes(s.id)}
                    />
                    {s.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </Field>
      ) : null}

      {schedule ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="notify" defaultChecked className="mt-0.5" />
          <span>
            <span className="font-medium">Notify parents now</span>
            <span className="block text-slate-500">
              By WhatsApp where possible, otherwise email. Parents without either are added to the office&apos;s
              to-do list (phone call or printed letter).
            </span>
          </span>
        </label>
      ) : null}

      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
