"use client";

import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";
import { RELATIONSHIPS, RELATIONSHIP_LABELS } from "@/lib/validation/people";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

type Guardian = {
  title: string | null;
  firstName: string;
  lastName: string;
  idNumber: string | null;
  occupation: string | null;
  address: string | null;
  preferredChannel: string | null;
  notes: string | null;
};

function GuardianFields({ guardian }: { guardian?: Guardian }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr_1fr]">
        <Field name="title" label="Title">
          <input id="title" name="title" className="input" placeholder="Mrs" defaultValue={guardian?.title ?? ""} />
        </Field>
        <Field name="firstName" label="First name">
          <input id="firstName" name="firstName" className="input" required defaultValue={guardian?.firstName} />
        </Field>
        <Field name="lastName" label="Surname">
          <input id="lastName" name="lastName" className="input" required defaultValue={guardian?.lastName} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="idNumber" label="ID number">
          <input id="idNumber" name="idNumber" className="input" defaultValue={guardian?.idNumber ?? ""} />
        </Field>
        <Field name="occupation" label="Occupation">
          <input id="occupation" name="occupation" className="input" defaultValue={guardian?.occupation ?? ""} />
        </Field>
        <Field name="preferredChannel" label="Prefers to be contacted by">
          <select
            id="preferredChannel"
            name="preferredChannel"
            className="input"
            defaultValue={guardian?.preferredChannel ?? ""}
          >
            <option value="">Best available</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="sms">SMS</option>
            <option value="call">Phone call</option>
            <option value="email">Email</option>
            <option value="letter">Printed letter</option>
          </select>
        </Field>
      </div>
      <Field name="address" label="Address">
        <textarea id="address" name="address" rows={2} className="input" defaultValue={guardian?.address ?? ""} />
      </Field>
      <Field name="notes" label="Notes">
        <textarea id="notes" name="notes" rows={2} className="input" defaultValue={guardian?.notes ?? ""} />
      </Field>
    </>
  );
}

export function PhoneCapabilities({ prefix = "" }: { prefix?: string }) {
  const name = (n: string) => (prefix ? `${prefix}${n[0].toUpperCase()}${n.slice(1)}` : n);
  return (
    <div className="flex flex-wrap gap-4 text-sm">
      <label className="flex items-center gap-1.5">
        <input type="checkbox" name={name("whatsapp")} defaultChecked /> WhatsApp
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" name={name("sms")} defaultChecked /> SMS
      </label>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" name={name("voice")} defaultChecked /> Calls
      </label>
    </div>
  );
}

export function LinkFields({ defaultRelationship = "mother" }: { defaultRelationship?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-end">
      <Field name="relationship" label="Relationship to learner">
        <select id="relationship" name="relationship" className="input" defaultValue={defaultRelationship}>
          {RELATIONSHIPS.map((r) => (
            <option key={r} value={r}>
              {RELATIONSHIP_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-4 pb-2 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="isPrimary" /> Primary contact
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="livesWith" defaultChecked /> Lives with learner
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="canCollect" defaultChecked /> May collect
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="receivesNotices" defaultChecked /> Gets notices
        </label>
      </div>
    </div>
  );
}

export function NewGuardianForm({ action, learnerId }: { action: Action; learnerId?: string }) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      {learnerId ? (
        <>
          <input type="hidden" name="learnerId" value={learnerId} />
          <LinkFields />
          <hr className="border-slate-200" />
        </>
      ) : null}
      <GuardianFields />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Field name="phone" label="Cellphone" hint="Leave empty if they have no phone.">
            <input id="phone" name="phone" type="tel" className="input" placeholder="082 123 4567" />
          </Field>
          <PhoneCapabilities prefix="phone" />
        </div>
        <Field name="email" label="Email" hint="Leave empty if they have no email.">
          <input id="email" name="email" type="email" className="input" />
        </Field>
      </div>
      <SubmitButton>Save parent</SubmitButton>
    </ActionForm>
  );
}

export function EditGuardianForm({ action, guardian }: { action: Action; guardian: Guardian }) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      <GuardianFields guardian={guardian} />
      <SubmitButton>Save changes</SubmitButton>
    </ActionForm>
  );
}

export function AddContactForm({ action }: { action: Action }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ActionForm action={action} className="space-y-2 rounded-md border border-slate-200 p-3" resetOnSuccess>
        <input type="hidden" name="kind" value="phone" />
        <Field name="value" label="Add phone number">
          <input id="value" name="value" type="tel" className="input" placeholder="082 123 4567" required />
        </Field>
        <input name="label" className="input" placeholder="Label, e.g. work (optional)" />
        <Field name="whatsapp" label="This number can receive">
          <PhoneCapabilities />
        </Field>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="isPrimary" /> Make primary
        </label>
        <SubmitButton className="btn-secondary">Add phone</SubmitButton>
      </ActionForm>
      <ActionForm action={action} className="space-y-2 rounded-md border border-slate-200 p-3" resetOnSuccess>
        <input type="hidden" name="kind" value="email" />
        <Field name="value" label="Add email">
          <input id="email-value" name="value" type="email" className="input" required />
        </Field>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="isPrimary" /> Make primary
        </label>
        <SubmitButton className="btn-secondary">Add email</SubmitButton>
      </ActionForm>
    </div>
  );
}

export function LinkGuardianForm({ action }: { action: Action }) {
  return (
    <ActionForm action={action} className="space-y-2">
      <LinkFields />
      <SubmitButton className="btn-secondary">Link</SubmitButton>
    </ActionForm>
  );
}
