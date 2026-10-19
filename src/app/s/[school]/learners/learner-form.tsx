"use client";

import { ActionForm, Field, SubmitButton, type FormState } from "@/components/action-form";

type Learner = {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  admissionNumber: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  idNumber: string | null;
  homeLanguage: string | null;
  medicalNotes: string | null;
  notes: string | null;
  status: string;
};

export function LearnerForm({
  action,
  learner,
  classes,
  classGroupId,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  learner?: Learner;
  classes: { id: string; name: string; gradeName: string }[];
  classGroupId?: string | null;
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} className="card space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="firstName" label="First name">
          <input id="firstName" name="firstName" className="input" defaultValue={learner?.firstName} required />
        </Field>
        <Field name="lastName" label="Surname">
          <input id="lastName" name="lastName" className="input" defaultValue={learner?.lastName} required />
        </Field>
        <Field name="preferredName" label="Preferred name">
          <input id="preferredName" name="preferredName" className="input" defaultValue={learner?.preferredName ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="admissionNumber" label="Admission number">
          <input
            id="admissionNumber"
            name="admissionNumber"
            className="input"
            defaultValue={learner?.admissionNumber ?? ""}
          />
        </Field>
        <Field name="classGroupId" label="Class">
          <select id="classGroupId" name="classGroupId" className="input" defaultValue={classGroupId ?? ""}>
            <option value="">Not in a class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.gradeName})
              </option>
            ))}
          </select>
        </Field>
        <Field name="status" label="Status">
          <select id="status" name="status" className="input" defaultValue={learner?.status ?? "active"}>
            <option value="active">Active</option>
            <option value="transferred">Transferred</option>
            <option value="graduated">Graduated</option>
            <option value="left">Left</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field name="dateOfBirth" label="Date of birth">
          <input id="dateOfBirth" name="dateOfBirth" type="date" className="input" defaultValue={learner?.dateOfBirth ?? ""} />
        </Field>
        <Field name="gender" label="Gender">
          <select id="gender" name="gender" className="input" defaultValue={learner?.gender ?? ""}>
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field name="idNumber" label="ID number">
          <input id="idNumber" name="idNumber" className="input" defaultValue={learner?.idNumber ?? ""} />
        </Field>
        <Field name="homeLanguage" label="Home language">
          <input id="homeLanguage" name="homeLanguage" className="input" defaultValue={learner?.homeLanguage ?? ""} />
        </Field>
      </div>
      <Field name="medicalNotes" label="Medical notes" hint="Allergies, chronic conditions, medication.">
        <textarea id="medicalNotes" name="medicalNotes" rows={2} className="input" defaultValue={learner?.medicalNotes ?? ""} />
      </Field>
      <Field name="notes" label="Other notes">
        <textarea id="notes" name="notes" rows={2} className="input" defaultValue={learner?.notes ?? ""} />
      </Field>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
