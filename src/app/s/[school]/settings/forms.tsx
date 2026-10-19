"use client";

import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";

type Action = (state: FormState, form: FormData) => Promise<FormState>;

export function DetailsForm({
  action,
  school,
}: {
  action: Action;
  school: {
    name: string;
    registrationNumber: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    timezone: string;
  };
}) {
  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label="School name">
          <input id="name" name="name" className="input" required defaultValue={school.name} />
        </Field>
        <Field name="registrationNumber" label="EMIS / registration number">
          <input id="registrationNumber" name="registrationNumber" className="input" defaultValue={school.registrationNumber ?? ""} />
        </Field>
        <Field name="phone" label="Phone">
          <input id="phone" name="phone" className="input" defaultValue={school.phone ?? ""} />
        </Field>
        <Field name="email" label="Email" hint="Parents' email replies go here.">
          <input id="email" name="email" type="email" className="input" defaultValue={school.email ?? ""} />
        </Field>
      </div>
      <Field name="address" label="Address" hint="Printed on letters to parents.">
        <textarea id="address" name="address" rows={2} className="input" defaultValue={school.address ?? ""} />
      </Field>
      <Field name="timezone" label="Timezone">
        <input id="timezone" name="timezone" className="input max-w-xs" defaultValue={school.timezone} />
      </Field>
      <SubmitButton>Save details</SubmitButton>
    </ActionForm>
  );
}

export function SecretsForm({
  action,
  hasWhaple,
  hasResend,
  resendFromEmail,
}: {
  action: Action;
  hasWhaple: boolean;
  hasResend: boolean;
  resendFromEmail: string | null;
}) {
  return (
    <ActionForm action={action} className="space-y-4" resetOnSuccess>
      <Field
        name="whapleApiKey"
        label={`Whaple (WhatsApp) API key ${hasWhaple ? "— set" : "— not set"}`}
        hint="Messages go out from the school's own WhatsApp number linked in Whaple. Leave empty to keep the current key."
      >
        <input id="whapleApiKey" name="whapleApiKey" type="password" className="input" autoComplete="off" />
      </Field>
      {hasWhaple ? (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="clear[]" value="whapleApiKey" /> Remove the WhatsApp key
        </label>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          name="resendApiKey"
          label={`Own Resend API key ${hasResend ? "— set" : "(optional)"}`}
          hint="Without one, email goes from the platform address with the school's name."
        >
          <input id="resendApiKey" name="resendApiKey" type="password" className="input" autoComplete="off" />
        </Field>
        <Field name="resendFromEmail" label="Send email from" hint="Must be verified in that Resend account.">
          <input id="resendFromEmail" name="resendFromEmail" type="email" className="input" defaultValue={resendFromEmail ?? ""} />
        </Field>
      </div>
      {hasResend ? (
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="clear[]" value="resendApiKey" /> Remove the Resend key
        </label>
      ) : null}
      <SubmitButton>Save messaging settings</SubmitButton>
    </ActionForm>
  );
}
